const fs = require('fs');
const axios = require('axios');

class TradingBotEnhanced {
    constructor(config = {}) {
        this.config = {
            symbol: config.symbol || 'BTCUSDT',
            interval: config.interval || '1m'
        };
        
        this.state = {
            position: null,
            priceHistory: [],
            volumeHistory: []
        };
        
        this.periods = {
            macd: { short: 12, long: 26, signal: 9 },
            bollinger: { period: 20, stdDev: 2 },
            volume: { period: 14 }
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
                timestamp: candle[0],
                price: parseFloat(candle[4]), // Preço de fechamento
                volume: parseFloat(candle[5])
            }));
        } catch (error) {
            this.logError('Market Data Fetch', error);
            return [];
        }
    }

    async start() {
        console.log('Bot iniciado. Pressione Ctrl+C para encerrar.');
        
        const updateMarketData = async () => {
            const marketData = await this.fetchMarketData();
            if (marketData.length > 0) {
                const lastCandle = marketData[marketData.length - 1];
                
                // Calcular indicadores básicos
                const basicIndicators = {
                    smaShort: this.calculateSMA(marketData.map(d => d.price), 13),
                    smaLong: this.calculateSMA(marketData.map(d => d.price), 50),
                    rsi: this.calculateRSI(marketData.map(d => d.price)),
                    volatility: this.calculateVolatility(marketData.map(d => d.price))
                };

                this.logPerformance(basicIndicators, lastCandle.price, lastCandle.volume);
            }
        };

        // Primeira execução
        await updateMarketData();
        // Atualizar a cada minuto
        setInterval(updateMarketData, 60000);
    }

    calculateSMA(prices, period) {
        if (prices.length < period) return 0;
        return prices.slice(-period).reduce((sum, price) => sum + price, 0) / period;
    }

    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;

        let gains = 0;
        let losses = 0;

        for (let i = 1; i < prices.length; i++) {
            const difference = prices[i] - prices[i - 1];
            if (difference >= 0) {
                gains += difference;
            } else {
                losses += Math.abs(difference);
            }
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        return 100 - (100 / (1 + (avgGain / avgLoss)));
    }

    calculateVolatility(prices, period = 14) {
        if (prices.length < period) return 0;
        
        const returns = prices.slice(-period).map((price, i, arr) => {
            if (i === 0) return 0;
            return (price - arr[i - 1]) / arr[i - 1];
        });

        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const squaredDiffs = returns.map(ret => Math.pow(ret - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((sum, diff) => sum + diff, 0) / returns.length);
    }

    logPerformance(indicators, currentPrice, volume) {
        // Atualizar históricos
        this.updateHistories(currentPrice, volume);

        const extendedIndicators = {
            ...indicators,
            macd: this.calculateMACD(),
            bollinger: this.calculateBollingerBands(),
            volume: {
                current: volume,
                average: this.calculateAverageVolume()
            },
            stochastic: this.calculateStochastic(),
            adx: this.calculateADX()
        };

        const logEntry = {
            timestamp: new Date().toISOString(),
            currentPrice,
            indicators: extendedIndicators,
            position: this.state.position
        };
        
        console.log(`[PERFORMANCE LOG] ${JSON.stringify(logEntry, null, 2)}`);
        fs.appendFileSync('enhanced-performance.log', JSON.stringify(logEntry) + '\n');
    }

    updateHistories(price, volume) {
        this.state.priceHistory.push(price);
        this.state.volumeHistory.push(volume);
        
        // Manter tamanho do histórico limitado
        const maxHistory = Math.max(
            this.periods.macd.long + this.periods.macd.signal,
            this.periods.bollinger.period,
            this.periods.volume.period
        );
        
        if (this.state.priceHistory.length > maxHistory) {
            this.state.priceHistory.shift();
            this.state.volumeHistory.shift();
        }
    }

    calculateMACD() {
        if (this.state.priceHistory.length < this.periods.macd.long) {
            return { line: 0, signal: 0, histogram: 0 };
        }

        const shortEMA = this.calculateEMA(this.periods.macd.short);
        const longEMA = this.calculateEMA(this.periods.macd.long);
        const macdLine = shortEMA - longEMA;
        const signalLine = this.calculateSignalLine(macdLine);
        
        return {
            line: macdLine,
            signal: signalLine,
            histogram: macdLine - signalLine
        };
    }

    calculateBollingerBands() {
        if (this.state.priceHistory.length < this.periods.bollinger.period) {
            return { upper: 0, middle: 0, lower: 0 };
        }

        const prices = this.state.priceHistory.slice(-this.periods.bollinger.period);
        const sma = prices.reduce((a, b) => a + b) / prices.length;
        const stdDev = Math.sqrt(
            prices.map(p => Math.pow(p - sma, 2))
                  .reduce((a, b) => a + b) / prices.length
        );

        return {
            upper: sma + (this.periods.bollinger.stdDev * stdDev),
            middle: sma,
            lower: sma - (this.periods.bollinger.stdDev * stdDev)
        };
    }

    calculateAverageVolume() {
        if (this.state.volumeHistory.length < this.periods.volume.period) {
            return 0;
        }
        
        const volumes = this.state.volumeHistory.slice(-this.periods.volume.period);
        return volumes.reduce((a, b) => a + b) / volumes.length;
    }

    calculateStochastic() {
        const period = 14; // Período padrão para Estocástico
        if (this.state.priceHistory.length < period) {
            return { k: 0, d: 0 };
        }

        const prices = this.state.priceHistory.slice(-period);
        const currentPrice = prices[prices.length - 1];
        const low = Math.min(...prices);
        const high = Math.max(...prices);
        
        const k = ((currentPrice - low) / (high - low)) * 100;
        return {
            k: k,
            d: this.calculateStochasticD(k)
        };
    }

    calculateADX() {
        // Implementação básica do ADX
        // Requer cálculos mais complexos com +DI e -DI
        return 0;
    }

    logError(context, error) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            context,
            error: error.message,
            stack: error.stack
        };
        
        console.error(`[ERROR LOG] ${JSON.stringify(errorLog, null, 2)}`);
        fs.appendFileSync('error.log', JSON.stringify(errorLog) + '\n');
    }
}

if (require.main === module) {
    const bot = new TradingBotEnhanced({
        symbol: 'BTCUSDT',
        interval: '1m'
    });
    
    bot.start().catch(error => {
        console.error('Erro ao iniciar o bot:', error);
    });
}

module.exports = TradingBotEnhanced;

//Como módulo em outro arquivo:
// const TradingBotEnhanced = require('./trading-bot-enhanced-indicators');
// const bot = new TradingBotEnhanced();

// node trading-bot-enhanced-indicators.js