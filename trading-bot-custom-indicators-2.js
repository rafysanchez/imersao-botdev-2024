const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');

class CustomIndicators {
    static sma(data, period) {
        if (data.length < period) return null;
        const slice = data.slice(-period);
        return slice.reduce((sum, val) => sum + val, 0) / period;
    }

    static rsi(closes, period = 14) {
        if (closes.length <= period) return 50;

        let gains = 0;
        let losses = 0;

        for (let i = 1; i < closes.length; i++) {
            const change = closes[i] - closes[i-1];
            if (change >= 0) gains += change;
            else losses -= change;
        }

        const averageGain = gains / period;
        const averageLoss = losses / period;

        const relativeStrength = averageLoss === 0 ? 100 : 100 - (100 / (1 + (averageGain / averageLoss)));
        return relativeStrength;
    }

    static standardDeviation(data) {
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length;
        return Math.sqrt(variance);
    }
}

class CryptoTradingBot {
    constructor(config = {}) {
        this.config = {
            symbol: config.symbol || 'BTCUSDT',
            interval: config.interval || '15m',
            capital: config.capital || 1000,
            maxRiskPerTrade: config.maxRiskPerTrade || 0.02
        };

        this.state = {
            position: null,
            trades: [],
            currentPrice: 0
        };
    }

    async fetchMarketData() {
        try {
            const response = await axios.get('https://api.binance.com/api/v3/klines', {
                params: {
                    symbol: this.config.symbol,
                    interval: this.config.interval,
                    limit: 100
                }
            });
            
            return response.data.map(candle => ({
                close: parseFloat(candle[4]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3])
            }));
        } catch (error) {
            this.logError('Market Data Fetch', error);
            return [];
        }
    }

    analyzeMarket(marketData) {
        const closes = marketData.map(candle => candle.close);
        
        return {
            smaShort: CustomIndicators.sma(closes, 13),
            smaLong: CustomIndicators.sma(closes, 50),
            rsi: CustomIndicators.rsi(closes),
            volatility: CustomIndicators.standardDeviation(closes)
        };
    }

    determineTradeSignal(indicators, currentPrice) {
        const bullishConditions = [
            indicators.smaShort > indicators.smaLong,
            indicators.rsi < 30,
            currentPrice < indicators.smaShort
        ];

        const bearishConditions = [
            indicators.smaShort < indicators.smaLong,
            indicators.rsi > 70,
            currentPrice > indicators.smaShort
        ];

        return {
            buy: bullishConditions.every(condition => condition),
            sell: bearishConditions.every(condition => condition)
        };
    }

    calculatePositionSize(currentPrice) {
        const maxRisk = this.config.capital * this.config.maxRiskPerTrade;
        return Math.floor(maxRisk / currentPrice);
    }

    async start() {
        setInterval(async () => {
            try {
                const marketData = await this.fetchMarketData();
                const currentPrice = marketData[marketData.length - 1].close;
                const indicators = this.analyzeMarket(marketData);
                const signals = this.determineTradeSignal(indicators, currentPrice);

                if (signals.buy && !this.state.position) {
                    const positionSize = this.calculatePositionSize(currentPrice);
                    this.executeTrade('BUY', currentPrice, positionSize);
                }

                if (signals.sell && this.state.position) {
                    this.executeTrade('SELL', currentPrice, this.state.position.size);
                }

                this.logPerformance(indicators, currentPrice);
            } catch (error) {
                this.logError('Trading Loop', error);
            }
        }, 60000); // A cada minuto
    }

    executeTrade(type, price, size) {
        const trade = {
            type,
            price,
            size,
            timestamp: new Date().toISOString()
        };

        this.state.trades.push(trade);
        this.logTrade(trade);

        if (type === 'BUY') {
            this.state.position = {
                entryPrice: price,
                size,
                stopLoss: price * 0.95,
                takeProfit: price * 1.02
            };
        } else {
            this.state.position = null;
        }
    }

    logTrade(trade) {
        console.log(`[TRADE] ${trade.type}: ${trade.size} @ ${trade.price}`);
        fs.appendFileSync('trades.log', JSON.stringify(trade) + '\n');
    }

    logPerformance(indicators, currentPrice) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            currentPrice,
            indicators,
            position: this.state.position
        };
        
        console.log(JSON.stringify(logEntry, null, 2));
        fs.appendFileSync('performance.log', JSON.stringify(logEntry) + '\n');
    }

    logError(context, error) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            context,
            error: error.message
        };
        
        console.error(`[ERROR] ${context}:`, error);
        fs.appendFileSync('errors.log', JSON.stringify(errorLog) + '\n');
    }
}

// Inicialização do Bot
const tradingBot = new CryptoTradingBot({
    symbol: 'BTCUSDT',
    capital: 5000,
    maxRiskPerTrade: 0.015
});

tradingBot.start();

module.exports = CryptoTradingBot;


//  node trading-bot-custom-indicators-2.js