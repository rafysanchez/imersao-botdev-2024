const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY;

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
    }

    async newOrder(symbol, quantity, side) {
        const order = { symbol, quantity, side };
        order.type = "MARKET";
        order.timestamp = Date.now();

        const signature = crypto
            .createHmac("sha256", this.config.secretKey)
            .update(new URLSearchParams(order).toString())
            .digest("hex");

        order.signature = signature;

        try {
            // Simulação de uma resposta de operação
            const response = {
                symbol: order.symbol,
                orderId: 123456,
                status: "FILLED",
                price: "20000",
                executedQty: order.quantity
            };

            // Salvar a resposta em um arquivo
            fs.writeFile("resultados_teste.json", JSON.stringify(response, null, 4), (err) => {
                if (err) {
                    console.error("Erro ao salvar os resultados:", err);
                } else {
                    console.log("Resultados salvos em resultados_teste.json");
                }
            });

            console.log("Ordem criada com sucesso:", response);
        } catch (error) {
            console.error("Erro ao criar a ordem:", error);
        }
    }

    // Método start básico
    start() {
        console.log('Bot iniciado com a configuração:', this.config);
        // Exemplo de chamada para newOrder
        this.newOrder(this.config.symbol, 0.01, 'BUY');
    }
}

const tradingBot = new CryptoTradingBot({});
tradingBot.start();

module.exports = CryptoTradingBot;