/*
 * Bot de Trading Aprimorado
 * Implementação com backtesting, logs detalhados, variáveis de ambiente e robustez adicional.
 */

require("dotenv").config(); // Carrega variáveis de ambiente de um arquivo .env
const axios = require("axios");
const crypto = require("crypto");
const talib = require("talib"); // Biblioteca especializada para análise técnica
const fs = require("fs");

const API_URL = process.env.API_URL || "https://testnet.binance.vision";
const SYMBOL = process.env.SYMBOL || "BTCUSDT";
const CAPITAL = parseFloat(process.env.CAPITAL) || 1000;
const MAX_RISK_PERCENTAGE = parseFloat(process.env.MAX_RISK_PERCENTAGE) || 0.02;
const API_KEY = process.env.API_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const BACKTEST_MODE = process.env.BACKTEST_MODE === "true";

let isOpened = false;
let entryPrice = 0; // Preço de entrada para stop-loss e take-profit
let logData = []; // Armazena as operações para auditoria

/**
 * Função para obter dados de mercado (em tempo real ou para backtesting)
 */
async function fetchData() {
    try {
        const response = await axios.get(
            `${API_URL}/api/v3/klines?limit=50&interval=15m&symbol=${SYMBOL}`
        );
        return response.data;
    } catch (error) {
        console.error("Erro ao buscar dados de mercado:", error.message);
        return [];
    }
}

/**
 * Função para calcular indicadores usando TA-Lib
 */
function calculateIndicators(data) {
    const closes = data.map(c => parseFloat(c[4]));

    // Cálculo de SMA (13 e 50 períodos)
    const smaShort = talib.SMA({ inReal: closes, startIdx: 0, endIdx: closes.length - 1, optInTimePeriod: 13 });
    const smaLong = talib.SMA({ inReal: closes, startIdx: 0, endIdx: closes.length - 1, optInTimePeriod: 50 });

    // RSI de 14 períodos
    const rsi = talib.RSI({ inReal: closes, startIdx: 0, endIdx: closes.length - 1, optInTimePeriod: 14 });

    // Volatilidade (desvio padrão)
    const volatility = talib.STDDEV({ inReal: closes, startIdx: 0, endIdx: closes.length - 1, optInTimePeriod: 21 });

    return {
        smaShort: smaShort.outReal[smaShort.outReal.length - 1],
        smaLong: smaLong.outReal[smaLong.outReal.length - 1],
        rsi: rsi.outReal[rsi.outReal.length - 1],
        volatility: volatility.outReal[volatility.outReal.length - 1]
    };
}

/**
 * Função para registrar logs de operações
 */
function logOperation(type, price, details) {
    const operation = { timestamp: new Date().toISOString(), type, price, details };
    logData.push(operation);
    console.log(operation);
    fs.appendFileSync("trading_log.json", JSON.stringify(operation) + "\n");
}

/**
 * Função principal para a estratégia de trading
 */
async function start() {
    const data = await fetchData();
    if (data.length === 0) return;

    const currentPrice = parseFloat(data[data.length - 1][4]); // Último preço de fechamento
    const indicators = calculateIndicators(data);

    console.clear();
    console.log(`Preço Atual: ${currentPrice}`);
    console.log(`SMA Curta: ${indicators.smaShort}`);
    console.log(`SMA Longa: ${indicators.smaLong}`);
    console.log(`RSI: ${indicators.rsi}`);
    console.log(`Volatilidade: ${indicators.volatility}`);

    const trendIsUp = indicators.smaShort > indicators.smaLong;

    // Entrada de compra
    if (!isOpened && trendIsUp && indicators.rsi < 30 && currentPrice < indicators.smaShort) {
        isOpened = true;
        entryPrice = currentPrice;
        logOperation("BUY", currentPrice, { entryPrice, indicators });
    }

    // Gerenciamento de posição
    if (isOpened) {
        const stopLossPrice = entryPrice - indicators.volatility * 1.5;
        const takeProfitPrice = entryPrice + indicators.volatility * 2;

        if (currentPrice <= stopLossPrice) {
            isOpened = false;
            logOperation("SELL_STOP_LOSS", currentPrice, { stopLossPrice });
        } else if (currentPrice >= takeProfitPrice) {
            isOpened = false;
            logOperation("SELL_TAKE_PROFIT", currentPrice, { takeProfitPrice });
        }
    }
}

/**
 * Função para executar backtesting com dados históricos
 */
async function runBacktest() {
    const historicalData = JSON.parse(fs.readFileSync("historical_data.json", "utf8"));
    historicalData.forEach((candle, index) => {
        const slice = historicalData.slice(0, index + 1);
        const indicators = calculateIndicators(slice);
        const currentPrice = parseFloat(candle[4]);

        const trendIsUp = indicators.smaShort > indicators.smaLong;

        if (!isOpened && trendIsUp && indicators.rsi < 30 && currentPrice < indicators.smaShort) {
            isOpened = true;
            entryPrice = currentPrice;
            logOperation("BACKTEST_BUY", currentPrice, { entryPrice, indicators });
        }

        if (isOpened) {
            const stopLossPrice = entryPrice - indicators.volatility * 1.5;
            const takeProfitPrice = entryPrice + indicators.volatility * 2;

            if (currentPrice <= stopLossPrice) {
                isOpened = false;
                logOperation("BACKTEST_SELL_STOP_LOSS", currentPrice, { stopLossPrice });
            } else if (currentPrice >= takeProfitPrice) {
                isOpened = false;
                logOperation("BACKTEST_SELL_TAKE_PROFIT", currentPrice, { takeProfitPrice });
            }
        }
    });

    console.log("Backtesting concluído. Verifique o arquivo 'trading_log.json' para resultados.");
}

/**
 * Início do bot
 */
if (BACKTEST_MODE) {
    runBacktest();
} else {
    setInterval(start, 3000); // Executa a cada 3 segundos
}