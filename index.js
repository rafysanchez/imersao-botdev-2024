const axios = require("axios");
const crypto = require("crypto");

const SYMBOL = "BTCUSDT";
const API_URL = "https://testnet.binance.vision";//https://api.binance.com

let isOpened = false;

function calcSMA(data) {
    const closes = data.map(candle => parseFloat(candle[4]));//pega somente os fechamentos
    const sum = closes.reduce((a, b) => a + b);//somatório de fechamentos
    return sum / data.length;//média simples
}

async function start() {
    const { data } = await axios.get(API_URL + "/api/v3/klines?limit=21&interval=15m&symbol=" + SYMBOL);//pega 21 velas de 15min
    const candle = data[data.length - 1];//pega última vela
    const price = parseFloat(candle[4]);//pega preço de fechameno

    console.clear();
    console.log("Price: " + price);

    const sma21 = calcSMA(data);//data tem 21 velas
    const sma13 = calcSMA(data.slice(8));//remove 8 velas das 21
    console.log("SMA (13): " + sma13);
    console.log("SMA (21): " + sma21);
    console.log("Is Opened? " + isOpened);

    if (sma13 > sma21 && isOpened === false) {
        console.log("comprar");
        isOpened = true;
    }
    else if (sma13 < sma21 && isOpened === true) {
        console.log("vender");
        isOpened = false;
    }
    else
        console.log("aguardar");
}

setInterval(start, 3000);

start();