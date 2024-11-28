require('dotenv').config();

const CryptoTradingBot = require('./trading-bot-v6');

async function initializeBot() {
    const botConfig = {
        apiKey: process.env.BINANCE_API_KEY,
        secretKey: process.env.BINANCE_SECRET_KEY,
        symbol: process.env.TRADING_SYMBOL || 'BTCUSDT',
        capital: parseFloat(process.env.TRADING_CAPITAL) || 5000,
        maxRiskPerTrade: 0.015  // 1.5% risk per trade
    };

    const tradingBot = new CryptoTradingBot(botConfig);
    
    try {
        await tradingBot.start();
        console.log('Trading Bot Initialized Successfully');
    } catch (error) {
        console.error('Bot Initialization Failed:', error);
    }
}

initializeBot();