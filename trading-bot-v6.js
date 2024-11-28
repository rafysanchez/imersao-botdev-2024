/*
sistema gerado por claude AI
*/

const axios = require('axios');
const talib = require('talib');
const fs = require('fs');
const { createHmac } = require('crypto');

class CryptoTradingBot {
    constructor(config) {
        this.config = {
            apiKey: process.env.API_KEY,
            secretKey: process.env.SECRET_KEY,
            symbol: process.env.SYMBOL || 'BTCUSDT',
            exchange: 'binance',
            interval: '15m',
            capital: parseFloat(process.env.CAPITAL) || 1000,
            maxRiskPerTrade: 0.02,
            ...config
        };

        this.state = {
            currentPosition: null,
            trades: [],
            performanceMetrics: {
                totalTrades: 0,
                profitableTrades: 0,
                totalProfit: 0
            }
        };
    }

    async fetchMarketData() {
        try {
            const response = await axios.get(`https://api.binance.com/api/v3/klines`, {
                params: {
                    symbol: this.config.symbol,
                    interval: this.config.interval,
                    limit: 100
                }
            });
            return response.data;
        } catch (error) {
            this.logError('Market Data Fetch Error', error);
            return [];
        }
    }

    calculateAdvancedIndicators(marketData) {
        const closes = marketData.map(candle => parseFloat(candle[4]));
        
        return {
            sma: {
                short: talib.SMA({ inReal: closes, optInTimePeriod: 13 }),
                medium: talib.SMA({ inReal: closes, optInTimePeriod: 50 }),
                long: talib.SMA({ inReal: closes, optInTimePeriod: 200 })
            },
            rsi: talib.RSI({ inReal: closes, optInTimePeriod: 14 }),
            macd: talib.MACD({
                inReal: closes,
                optInFastPeriod: 12,
                optInSlowPeriod: 26,
                optInSignalPeriod: 9
            }),
            bollinger: talib.BBANDS({
                inReal: closes,
                optInTimePeriod: 20,
                optInNbDevUp: 2,
                optInNbDevDn: 2
            }),
            volatility: talib.STDDEV({ inReal: closes, optInTimePeriod: 20 })
        };
    }

    determineTradeSignal(indicators, currentPrice) {
        const lastIndex = indicators.rsi.outReal.length - 1;
        const bullishConditions = [
            indicators.sma.short.outReal[lastIndex] > indicators.sma.medium.outReal[lastIndex],
            indicators.rsi.outReal[lastIndex] < 30,
            indicators.macd.outMACD[lastIndex] > indicators.macd.outMACDSignal[lastIndex]
        ];

        const bearishConditions = [
            indicators.sma.short.outReal[lastIndex] < indicators.sma.medium.outReal[lastIndex],
            indicators.rsi.outReal[lastIndex] > 70,
            indicators.macd.outMACD[lastIndex] < indicators.macd.outMACDSignal[lastIndex]
        ];

        return {
            buy: bullishConditions.every(condition => condition),
            sell: bearishConditions.every(condition => condition)
        };
    }

    calculatePositionSize(currentPrice, riskAmount) {
        const maxPositionSize = this.config.capital / currentPrice;
        const riskPerCoin = currentPrice * this.config.maxRiskPerTrade;
        return Math.min(maxPositionSize, riskAmount / riskPerCoin);
    }

    async executeTradeLogic() {
        const marketData = await this.fetchMarketData();
        const currentPrice = parseFloat(marketData[marketData.length - 1][4]);
        const indicators = this.calculateAdvancedIndicators(marketData);
        const signals = this.determineTradeSignal(indicators, currentPrice);

        if (signals.buy && !this.state.currentPosition) {
            const positionSize = this.calculatePositionSize(currentPrice, this.config.capital * this.config.maxRiskPerTrade);
            this.executeTrade('BUY', positionSize, currentPrice);
        }

        if (signals.sell && this.state.currentPosition) {
            this.executeTrade('SELL', this.state.currentPosition.size, currentPrice);
        }

        this.manageRisk(currentPrice, indicators);
    }

    executeTrade(type, size, price) {
        const tradeDetails = {
            type,
            timestamp: new Date(),
            price,
            size
        };

        this.state.trades.push(tradeDetails);
        this.updatePerformanceMetrics(tradeDetails);

        if (type === 'BUY') {
            this.state.currentPosition = {
                entryPrice: price,
                size,
                stopLoss: price * 0.95,
                takeProfit: price * 1.03
            };
        } else {
            this.state.currentPosition = null;
        }

        this.logTrade(tradeDetails);
    }

    manageRisk(currentPrice, indicators) {
        if (!this.state.currentPosition) return;

        const position = this.state.currentPosition;
        const volatility = indicators.volatility.outReal[indicators.volatility.outReal.length - 1];

        // Dynamic stop-loss and take-profit
        const dynamicStopLoss = position.entryPrice - (volatility * 1.5);
        const dynamicTakeProfit = position.entryPrice + (volatility * 2);

        if (currentPrice <= dynamicStopLoss || currentPrice >= dynamicTakeProfit) {
            this.executeTrade('SELL', position.size, currentPrice);
        }
    }

    updatePerformanceMetrics(trade) {
        const metrics = this.state.performanceMetrics;
        metrics.totalTrades++;
        
        if (trade.type === 'SELL') {
            const profitPercentage = ((trade.price - this.state.currentPosition.entryPrice) / this.state.currentPosition.entryPrice) * 100;
            metrics.totalProfit += profitPercentage;
            
            if (profitPercentage > 0) {
                metrics.profitableTrades++;
            }
        }
    }

    logTrade(trade) {
        console.log(`[TRADE] ${trade.type} - Size: ${trade.size} @ ${trade.price}`);
        fs.appendFileSync('trades.log', JSON.stringify(trade) + '\n');
    }

    logError(context, error) {
        console.error(`[ERROR] ${context}:`, error);
        fs.appendFileSync('error.log', `${new Date().toISOString()} - ${context}: ${error}\n`);
    }

    async start() {
        setInterval(async () => {
            try {
                await this.executeTradeLogic();
            } catch (error) {
                this.logError('Trading Loop Error', error);
            }
        }, 60000); // Execute every minute
    }
}

// Configuração e inicialização
const botConfig = {
    maxRiskPerTrade: 0.015,  // 1.5% risk per trade
    capital: 5000,
    symbol: 'BTCUSDT'
};

const tradingBot = new CryptoTradingBot(botConfig);
tradingBot.start();

module.exports = CryptoTradingBot;


// npm install axios talib dotenv
// node trading-bot-v6.js
