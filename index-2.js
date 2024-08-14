/**
 * INDEX-2.js
 * Exemplo didático com cruzamento de 2 médias
 */

const axios = require("axios");
const crypto = require("crypto");

const SYMBOL = "BTCUSDT";
const QUANTITY = "0.001";
const API_KEY = "XXX";//aprenda a criar as chaves: https://www.youtube.com/watch?v=-6bF6a6ecIs
const SECRET_KEY = "XXX";
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
        isOpened = true;
        newOrder(SYMBOL, QUANTITY, "BUY");
    }
    else if (sma13 < sma21 && isOpened === true) {
        newOrder(SYMBOL, QUANTITY, "SELL");
        isOpened = false;
    }
    else
        console.log("aguardar");
}

async function newOrder(symbol, quantity, side) {
    const order = { symbol, quantity, side };
    order.type = "MARKET";
    order.timestamp = Date.now();

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
            });

        console.log(data);
    } catch (err) {
        //para erros e soluções com essa API, consulte https://www.luiztools.com.br/post/erros-comuns-com-as-apis-da-binance/
        console.error(err.response.data);
    }
}

setInterval(start, 3000);

start();