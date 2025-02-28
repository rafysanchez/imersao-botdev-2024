const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

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
            checkInterval: 15000,
            ...config
        };
        this.isRunning = false;
        this.interval = null;
        this.resultadosFile = 'resultados_operacoes.json';
        this.initializeResultsFile();
    }

    initializeResultsFile() {
        if (!fs.existsSync(this.resultadosFile)) {
            fs.writeFileSync(this.resultadosFile, JSON.stringify({ operacoes: [] }, null, 4));
        }
    }

    async saveOperation(operation) {
        try {
            const fileContent = fs.readFileSync(this.resultadosFile, 'utf8');
            const data = JSON.parse(fileContent);
            data.operacoes.push(operation);
            fs.writeFileSync(this.resultadosFile, JSON.stringify(data, null, 4));
            console.log(`Operação salva em ${this.resultadosFile}`);
        } catch (error) {
            console.error("Erro ao salvar a operação:", error);
        }
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
            const response = {
                symbol: order.symbol,
                orderId: Math.floor(Math.random() * 1000000),
                status: "FILLED",
                price: "20000",
                executedQty: order.quantity,
                timestamp: new Date().toISOString()
            };

            // Salva a operação no arquivo único
            await this.saveOperation(response);

            console.log(`[${new Date().toLocaleString()}] Ordem criada com sucesso:`, response);
        } catch (error) {
            console.error(`[${new Date().toLocaleString()}] Erro ao criar a ordem:`, error);
        }
    }

    start() {
        if (this.isRunning) {
            console.log('Bot já está em execução!');
            return;
        }

        this.isRunning = true;
        console.log('[INÍCIO] Bot iniciado com a configuração:', this.config);
        
        // Executa imediatamente a primeira vez
        this.newOrder(this.config.symbol, 0.01, 'BUY');
        
        // Configura o intervalo de execução
        this.interval = setInterval(() => {
            if (this.isRunning) {
                console.log(`\n[${new Date().toLocaleString()}] Verificando novas operações...`);
                this.newOrder(this.config.symbol, 0.01, 'BUY');
            }
        }, this.config.checkInterval);

        // Adiciona handler para parar o bot graciosamente
        process.on('SIGINT', () => {
            this.stop();
            process.exit();
        });
    }

    stop() {
        this.isRunning = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log(`\n[${new Date().toLocaleString()}] Bot parado`);
    }
}

// Criação e inicialização do bot
const tradingBot = new CryptoTradingBot({});
tradingBot.start();

module.exports = CryptoTradingBot;