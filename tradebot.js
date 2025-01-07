require('dotenv').config();
const axios = require("axios");
const crypto = require("crypto");
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_KEY; // Insira sua chave API aqui
const SECRET_KEY = process.env.SECRET_KEY; // Insira sua chave secreta aqui

console.log("API_KEY:", API_KEY);
console.log("SECRET_KEY:", SECRET_KEY);

const API_URL = "https://testnet.binance.vision"; // Use a URL da testnet para testes
const SYMBOL = "BTCUSDT";
const QUANTITY = "0.001";


let isOpened = false;
let entryPrice = 0; // Preço de entrada para o stop-loss e take-profit

function calcSMA(data, period) {
    const closes = data.map(candle => parseFloat(candle[4])); // Preços de fechamento
    const sum = closes.slice(-period).reduce((a, b) => a + b, 0); // Somatório dos últimos 'period' fechamentos
    return sum / period; // Média simples
}

function logTransaction(type, price, quantity) {
    const logFilePath = path.join(__dirname, 'trading_log.csv');
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

    if (price < smaShort && !isOpened) {
        isOpened = true;
        entryPrice = price; // Armazena o preço de entrada
        newOrder(SYMBOL, QUANTITY, "BUY");
        logTransaction("BUY", entryPrice, QUANTITY); // Registrar compra
    } else if (isOpened) {
        const stopLossPrice = entryPrice * 0.95; // Stop-loss a 5% abaixo do preço de entrada
        const takeProfitPrice = entryPrice * 1.10; // Take-profit a 10% acima do preço de entrada

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
        .createHmac("sha256", SECRET_KEY.toString())
        .update(new URLSearchParams(order).toString())
        .digest("hex");

    order.signature = signature;

    try {
        const { data } = await axios.post(
            API_URL + "/api/v3/order",
            new URLSearchParams(order).toString(),
            {
                headers: { "X-MBX-APIKEY": API_KEY.toString() }
            }
        );

        console.log(data);
    } catch (err) {
        console.error(err.response.data);
    }
}

setInterval(start, 3000); // Executa a função a cada 3 segundos

start();

