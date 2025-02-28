const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const winston = require('winston');
const config = require('./config.json');
require('dotenv').config();

// Configuração do logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console()
    ]
});

class CustomIndicators {
    static sma(data, period) {
        if (!Array.isArray(data) || data.length < period) {
            throw new Error('Invalid data for SMA calculation');
        }
        const slice = data.slice(-period);
        return slice.reduce((sum, val) => sum + val, 0) / period;
    }

    static ema(data, period) {
        if (!Array.isArray(data) || data.length < period) {
            logger.warn(`EMA calculation failed: insufficient data (length: ${data?.length}, required: ${period})`);
            return null;
        }
        
        const validData = data.map(Number).filter(n => !isNaN(n));
        if (validData.length < period) {
            logger.warn(`EMA calculation failed: insufficient valid numeric data`);
            return null;
        }

        const k = 2 / (period + 1);
        let ema = validData[0];
        for (let i = 1; i < validData.length; i++) {
            ema = (validData[i] * k) + (ema * (1 - k));
        }
        return ema;
    }

    static rsi(closes, period = 14) {
        if (!Array.isArray(closes) || closes.length <= period) {
            throw new Error('Invalid data for RSI calculation');
        }

        let gains = 0;
        let losses = 0;

        for (let i = 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change >= 0) gains += change;
            else losses -= change;
        }

        const averageGain = gains / period;
        const averageLoss = losses / period;

        return averageLoss === 0 ? 100 : 100 - (100 / (1 + (averageGain / averageLoss)));
    }

    static macd(data, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
        if (!Array.isArray(data) || data.length < Math.max(shortPeriod, longPeriod)) {
            logger.warn('Insufficient data for MACD calculation');
            return {
                macd: null,
                signal: null,
                histogram: null
            };
        }

        const shortEMA = this.ema(data, shortPeriod);
        const longEMA = this.ema(data, longPeriod);

        if (shortEMA === null || longEMA === null) {
            return {
                macd: null,
                signal: null,
                histogram: null
            };
        }

        const macdLine = shortEMA - longEMA;
        const signalLine = this.ema([macdLine], signalPeriod);
        
        return {
            macd: macdLine,
            signal: signalLine,
            histogram: signalLine !== null ? macdLine - signalLine : null
        };
    }

    static bollinger(data, period = 20, stdDev = 2) {
        const sma = this.sma(data, period);
        const std = this.standardDeviation(data.slice(-period));
        return {
            middle: sma,
            upper: sma + (stdDev * std),
            lower: sma - (stdDev * std)
        };
    }

    static standardDeviation(data) {
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length;
        return Math.sqrt(variance);
    }
}

class StateManager {
    constructor(filepath) {
        this.filepath = filepath;
        this.state = this.loadState();
    }

    loadState() {
        try {
            if (fs.existsSync(this.filepath)) {
                return JSON.parse(fs.readFileSync(this.filepath, 'utf8'));
            }
        } catch (error) {
            logger.error('Error loading state:', error);
        }
        return {
            position: null,
            trades: [],
            metrics: {
                totalTrades: 0,
                successfulTrades: 0,
                totalProfit: 0
            }
        };
    }

    saveState() {
        try {
            fs.writeFileSync(this.filepath, JSON.stringify(this.state, null, 2));
        } catch (error) {
            logger.error('Error saving state:', error);
        }
    }

    updateState(newState) {
        this.state = { ...this.state, ...newState };
        this.saveState();
    }
}

class CryptoTradingBot {
    constructor(config = {}) {
        this.config = {
            symbol: config.symbol || 'BTCUSDT',
            interval: config.interval || '15m',
            capital: config.capital || 1000,
            maxRiskPerTrade: config.maxRiskPerTrade || 0.02,
            apiKey: config.apiKey || process.env.API_KEY,
            apiSecret: config.apiSecret || process.env.SECRET_KEY,
            backtesting: config.backtesting || false
        };
        this.validateConfig(this.config);
        this.stateManager = new StateManager('bot_state.json');
        this.setupAxiosInstance();
        this.setupRateLimiting();
    }

    validateConfig(config) {
        const requiredFields = ['apiKey', 'apiSecret', 'symbol'];
        for (const field of requiredFields) {
            if (!config[field]) {
                throw new Error(`Missing required configuration: ${field}`);
            }
        }
    }

    setupAxiosInstance() {
        this.api = axios.create({
            baseURL: 'https://testnet.binance.vision',
            timeout: 5000,
            headers: {
                'X-MBX-APIKEY': this.config.apiKey
            }
        });
    }

    setupRateLimiting() {
        this.requestCount = 0;
        this.requestLimit = 1200; // Binance limit per minute
        this.requestResetTime = Date.now() + 60000;
    }

    async makeAuthenticatedRequest(method, endpoint, data = {}) {
        if (this.requestCount >= this.requestLimit) {
            const waitTime = this.requestResetTime - Date.now();
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            this.requestCount = 0;
            this.requestResetTime = Date.now() + 60000;
        }

        const timestamp = Date.now();
        const queryString = Object.entries({ ...data, timestamp })
            .map(([key, value]) => `${key}=${value}`)
            .join('&');

        const signature = crypto
            .createHmac('sha256', this.config.apiSecret)
            .update(queryString)
            .digest('hex');

        try {
            const response = await this.api[method](`${endpoint}?${queryString}&signature=${signature}`);
            this.requestCount++;
            return response.data;
        } catch (error) {
            logger.error('API request failed:', error);
            throw error;
        }
    }

    async fetchMarketData(retryCount = 3) {
        for (let i = 0; i < retryCount; i++) {
            try {
                const response = await this.api.get('/api/v3/klines', {
                    params: {
                        symbol: this.config.symbol,
                        interval: this.config.interval,
                        limit: 100
                    }
                });

                return response.data.map(candle => ({
                    timestamp: candle[0],
                    open: parseFloat(candle[1]),
                    high: parseFloat(candle[2]),
                    low: parseFloat(candle[3]),
                    close: parseFloat(candle[4]),
                    volume: parseFloat(candle[5])
                }));
            } catch (error) {
                logger.error(`Attempt ${i + 1} failed:`, error);
                if (i === retryCount - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }

    analyzeMarket(marketData) {
        const closes = marketData.map(candle => candle.close);
        const highs = marketData.map(candle => candle.high);
        const lows = marketData.map(candle => candle.low);

        return {
            smaShort: CustomIndicators.sma(closes, 13),
            smaLong: CustomIndicators.sma(closes, 50),
            rsi: CustomIndicators.rsi(closes),
            macd: CustomIndicators.macd(closes),
            bollinger: CustomIndicators.bollinger(closes),
            volatility: CustomIndicators.standardDeviation(closes)
        };
    }

    determineTradeSignal(indicators, currentPrice, marketData) {
        if (!indicators.macd || !indicators.bollinger || indicators.rsi === null) {
            logger.warn('Insufficient data for trade signal determination');
            return {
                buy: false,
                sell: false
            };
        }

        const volatilityThreshold = 0.02;
        const { bollinger, rsi, macd } = indicators;

        const bullishConditions = [
            currentPrice < bollinger.lower,
            rsi < 30,
            macd.histogram > 0,
            indicators.volatility < volatilityThreshold
        ];

        const bearishConditions = [
            currentPrice > bollinger.upper,
            rsi > 70,
            macd.histogram < 0,
            indicators.volatility < volatilityThreshold
        ];

        return {
            buy: bullishConditions.every(condition => condition),
            sell: bearishConditions.every(condition => condition)
        };
    }

    calculatePositionSize(currentPrice) {
        const maxRisk = this.config.capital * this.config.maxRiskPerTrade;
        const positionSize = Math.floor(maxRisk / currentPrice);
        return Math.max(0, Math.min(positionSize, this.config.capital / currentPrice));
    }

    calculateStopLoss(type, entryPrice, atr) {
        const multiplier = 2;
        return type === 'BUY' 
            ? entryPrice - (atr * multiplier)
            : entryPrice + (atr * multiplier);
    }

    calculateTakeProfit(type, entryPrice, atr) {
        const multiplier = 3;
        return type === 'BUY'
            ? entryPrice + (atr * multiplier)
            : entryPrice - (atr * multiplier);
    }

    async executeTrade(type, price, size) {
        if (this.config.backtesting) {
            return this.executeBacktestTrade(type, price, size);
        }

        try {
            const order = await this.makeAuthenticatedRequest('post', '/api/v3/order', {
                symbol: this.config.symbol,
                side: type,
                type: 'MARKET',
                quantity: size
            });

            const trade = {
                type,
                price,
                size,
                orderId: order.orderId,
                timestamp: new Date().toISOString()
            };

            this.stateManager.state.trades.push(trade);
            this.updatePosition(type, price, size);
            this.logTrade(trade);
            return order;
        } catch (error) {
            logger.error('Trade execution failed:', error);
            throw error;
        }
    }

    updatePosition(type, price, size) {
        if (type === 'BUY') {
            const atr = this.calculateATR(this.marketData);
            this.stateManager.updateState({
                position: {
                    entryPrice: price,
                    size,
                    stopLoss: this.calculateStopLoss('BUY', price, atr),
                    takeProfit: this.calculateTakeProfit('BUY', price, atr)
                }
            });
        } else {
            this.stateManager.updateState({ position: null });
        }
    }

    async start() {
        logger.info('Starting trading bot...');
        
        const runTrading = async () => {
            try {
                const marketData = await this.fetchMarketData();
                this.marketData = marketData;
                const currentPrice = marketData[marketData.length - 1].close;
                const indicators = this.analyzeMarket(marketData);
                const signals = this.determineTradeSignal(indicators, currentPrice, marketData);

                await this.checkStopLossAndTakeProfit(currentPrice);
                await this.processTradeSignals(signals, currentPrice);
                
                this.logPerformance(indicators, currentPrice);
            } catch (error) {
                logger.error('Trading loop error:', error);
            }
        };

        // Uso de setTimeout recursivo em vez de setInterval
        const scheduleNextRun = () => {
            setTimeout(async () => {
                await runTrading();
                scheduleNextRun();
            }, 60000);
        };

        scheduleNextRun();
    }

    async checkStopLossAndTakeProfit(currentPrice) {
        const position = this.stateManager.state.position;
        if (!position) return;

        if (currentPrice <= position.stopLoss || currentPrice >= position.takeProfit) {
            await this.executeTrade('SELL', currentPrice, position.size);
        }
    }

    async processTradeSignals(signals, currentPrice) {
        const position = this.stateManager.state.position;

        if (signals.buy && !position) {
            const positionSize = this.calculatePositionSize(currentPrice);
            await this.executeTrade('BUY', currentPrice, positionSize);
        }

        if (signals.sell && position) {
            await this.executeTrade('SELL', currentPrice, position.size);
        }
    }

    calculateATR(marketData, period = 14) {
        const trueRanges = marketData.map((candle, i) => {
            if (i === 0) return candle.high - candle.low;
            
            const previousClose = marketData[i - 1].close;
            return Math.max(
                candle.high - candle.low,
                Math.abs(candle.high - previousClose),
                Math.abs(candle.low - previousClose)
            );
        });

        return CustomIndicators.sma(trueRanges, period);
    }

    logTrade(trade) {
        logger.info('Trade executed:', trade);
        this.updateMetrics(trade);
    }

    updateMetrics(trade) {
        const metrics = this.stateManager.state.metrics;
        metrics.totalTrades++;
        
        if (trade.type === 'SELL') {
            const lastBuy = this.stateManager.state.trades
                .slice()
                .reverse()
                .find(t => t.type === 'BUY');

            if (lastBuy) {
                const profit = (trade.price - lastBuy.price) * trade.size;
                metrics.totalProfit += profit;
                if (profit > 0) metrics.successfulTrades++;
            }
        }

        this.stateManager.saveState();
    }

    logPerformance(indicators, currentPrice) {
        const metrics = this.stateManager.state.metrics;
        const winRate = (metrics.successfulTrades / metrics.totalTrades) * 100 || 0;

        logger.info('Performance Update', {
            currentPrice,
            indicators,
            metrics: {
                ...metrics,
                winRate: `${winRate.toFixed(2)}%`
            }
        });
    }
}

// Exemplo de uso
if (require.main === module) {
    const tradingBot = new CryptoTradingBot({
        symbol: 'BTCUSDT',
        capital: 10000,
        maxRiskPerTrade: 0.02,
        apiKey: process.env.API_KEY,
        apiSecret: process.env.SECRET_KEY
    });

    tradingBot.start().catch(error => {
        logger.error('Bot startup failed:', error);
        process.exit(1);
    });
}

module.exports = CryptoTradingBot; 