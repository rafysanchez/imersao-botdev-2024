/*
 * Bot de Trading Aprimorado
 * Estratégia com médias móveis, gestão de risco (stop-loss e take-profit) e volatilidade.
 */

const axios = require("axios");
const crypto = require("crypto");
const fs = require('fs');
const path = require('path');

const API_URL = "https://testnet.binance.vision"; // Use a URL da testnet para testes
const SYMBOL = "BTCUSDT";
const QUANTITY = "0.001";
const API_KEY = process.env.API_KEY; // Insira sua chave API aqui
const SECRET_KEY = process.env.SECRET_KEY; // Insira sua chave secreta aqui

let isOpened = false;
let entryPrice = 0; // Preço de entrada para o stop-loss e take-profit

function calcSMA(data, period) {
    const closes = data.map(candle => parseFloat(candle[4])); // Preços de fechamento
    const sum = closes.slice(-period).reduce((a, b) => a + b, 0); // Somatório dos últimos 'period' fechamentos
    return sum / period; // Média simples
}

function calcVolatility(data, period) {
    const closes = data.map(candle => parseFloat(candle[4])); // Preços de fechamento
    const mean = calcSMA(data, period);
    const variance = closes.slice(-period).reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
    return Math.sqrt(variance); // Desvio padrão
}

// Função para registrar transações
function logTransaction(type, price, quantity) {
    const logFilePath = path.join(__dirname, 'trading_log2.csv');
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp},${type},${price},${quantity}\n`;

    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) {
            console.error("Erro ao registrar a transação:", err);
        } else {
            console.log("Transação registrada:", logEntry.trim());
        }
    });
}

async function start() {
    const { data } = await axios.get(API_URL + "/api/v3/klines?limit=21&interval=15m&symbol=" + SYMBOL);
    const candle = data[data.length - 1];
    const price = parseFloat(candle[4]); // Preço de fechamento atual

    console.clear();
    console.log("Preço Atual: " + price);

    const smaShort = calcSMA(data, 13); // SMA de 13 períodos
    const smaLong = calcSMA(data, 21); // SMA de 21 períodos
    console.log("SMA Curta: " + smaShort);
    console.log("SMA Longa: " + smaLong);
    console.log("Posição Aberta? " + isOpened);

    const volatility = calcVolatility(data, 21); // Volatilidade dos últimos 21 períodos
    console.log("Volatilidade: " + volatility);

    if (price < smaShort && !isOpened) {
        isOpened = true;
        entryPrice = price; // Armazena o preço de entrada
        newOrder(SYMBOL, QUANTITY, "BUY");
        logTransaction("BUY", entryPrice, QUANTITY); // Registrar compra
    } else if (isOpened) {
        const stopLossPrice = entryPrice - (volatility * 1.5); // Stop-loss ajustado pela volatilidade
        const takeProfitPrice = entryPrice + (volatility * 2); // Take-profit ajustado pela volatilidade

        if (price <= stopLossPrice) {
            newOrder(SYMBOL, QUANTITY, "SELL"); // Vende se atingir o stop-loss
            logTransaction("SELL", price, QUANTITY); // Registrar venda
            isOpened = false;
            console.log("Stop-Loss ativado. Vendido a: " + price);
        } else if (price >= takeProfitPrice) {
            newOrder(SYMBOL, QUANTITY, "SELL"); // Vende se atingir o take-profit
            logTransaction("SELL", price, QUANTITY); // Registrar venda
            isOpened = false;
            console.log("Take-Profit ativado. Vendido a: " + price);
        }
    }
}

async function newOrder(symbol, quantity, side) {
    const order = { symbol, quantity, side, type: "MARKET", timestamp: Date.now() };

    const signature = crypto
        .createHmac("sha256", SECRET_KEY)
        .update(new URLSearchParams(order).toString())
        .digest("hex");

    order.signature = signature;

    try {
        const { data } = await axios.post(
            API_URL + "/api/v3/order",
            new URLSearchParams(order).toString(),
            {
                headers: { "X-MBX-APIKEY": API_KEY }
            }
        );

        console.log(data);
    } catch (err) {
        console.error(err.response.data);
    }
}

setInterval(start, 3000); // Executa a função a cada 3 segundos

start();