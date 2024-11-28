const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');



class CustomIndicators {
    // Média Móvel Simples (SMA)
    static sma(data, period) {
        return data.slice(-period)
            .reduce((sum, value) => sum + value, 0) / period;
    }

    // Índice de Força Relativa (RSI)
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

    // MACD - Moving Average Convergence Divergence
    static macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        const fastEMA = this.ema(closes, fastPeriod);
        const slowEMA = this.ema(closes, slowPeriod);
        const macdLine = fastEMA - slowEMA;
        const signalLine = this.ema([macdLine], signalPeriod);

        return { macd: macdLine, signal: signalLine };
    }

    // Exponential Moving Average (EMA)
    static ema(data, period) {
        const smoothing = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;

        for (let i = period; i < data.length; i++) {
            ema = (data[i] - ema) * smoothing + ema;
        }

        return ema;
    }

    // Desvio Padrão para Volatilidade
    static standardDeviation(data) {
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length;
        return Math.sqrt(variance);
    }

    // Bandas de Bollinger
    static bollinger(closes, period = 20, multiplier = 2) {
        const sma = this.sma(closes, period);
        const stdDev = this.standardDeviation(closes.slice(-period));
        
        return {
            middle: sma,
            upper: sma + (stdDev * multiplier),
            lower: sma - (stdDev * multiplier)
        };
    }
}

class CryptoTradingBot {
    constructor(config) {
        this.config = {
            symbol: config.symbol || 'BTCUSDT',
            capital: config.capital || 1000,
            maxRiskPerTrade: config.maxRiskPerTrade || 0.02
        };

        this.state = {
            position: null,
            trades: []
        };
    }

    async fetchMarketData() {
        try {
            const response = await axios.get('https://api.binance.com/api/v3/klines', {
                params: {
                    symbol: this.config.symbol,
                    interval: '15m',
                    limit: 100
                }
            });
            return response.data.map(candle => parseFloat(candle[4])); // Fecha preços
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
            return [];
        }
    }

    analyzeMarket(closes) {
        return {
            smaShort: CustomIndicators.sma(closes, 13),
            smaLong: CustomIndicators.sma(closes, 50),
            rsi: CustomIndicators.rsi(closes),
            macd: CustomIndicators.macd(closes),
            bollinger: CustomIndicators.bollinger(closes),
            volatility: CustomIndicators.standardDeviation(closes)
        };
    }

    determineTradeSignal(indicators, currentPrice) {
        const buySignals = [
            indicators.smaShort > indicators.smaLong,
            indicators.rsi < 30,
            currentPrice < indicators.bollinger.lower
        ];

        const sellSignals = [
            indicators.smaShort < indicators.smaLong,
            indicators.rsi > 70,
            currentPrice > indicators.bollinger.upper
        ];

        return {
            buy: buySignals.every(signal => signal),
            sell: sellSignals.every(signal => signal)
        };
    }

    async start() {
        setInterval(async () => {
            const closes = await this.fetchMarketData();
            const currentPrice = closes[closes.length - 1];
            const indicators = this.analyzeMarket(closes);
            const signals = this.determineTradeSignal(indicators, currentPrice);

            // Lógica de trading simplificada
            if (signals.buy && !this.state.position) {
                this.executeTrade('BUY', currentPrice);
            }

            if (signals.sell && this.state.position) {
                this.executeTrade('SELL', currentPrice);
            }
        }, 60000); // A cada minuto
    }

    executeTrade(type, price) {
        const tradeLog = { 
            type, 
            price, 
            timestamp: new Date() 
        };
        this.state.trades.push(tradeLog);
        console.log(`Trade executado: ${JSON.stringify(tradeLog)}`);
    }
}

// Inicialização
const bot = new CryptoTradingBot({
    symbol: 'BTCUSDT',
    capital: 5000,
    maxRiskPerTrade: 0.015
});

bot.start();
