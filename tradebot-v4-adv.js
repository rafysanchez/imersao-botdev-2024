/*
 * Bot de Trading Aprimorado
 * Este bot utiliza estratégias baseadas em médias móveis, RSI, ADX, gestão de risco dinâmica e trailing stop-loss.
 * Ele monitora múltiplos timeframes e ajusta a posição de forma adaptável para proteger o capital e maximizar os lucros.
 */

const axios = require("axios");
const crypto = require("crypto");
const fs = require('fs'); // Adicionando o módulo fs
const path = require('path'); // Adicionando o módulo path

// Configurações principais
const API_URL = "https://testnet.binance.vision"; // URL da API da Testnet do Binance (uso para testes)
const SYMBOL = "BTCUSDT"; // Par de trading
const INITIAL_QUANTITY = 0.001; // Quantidade inicial para operações
const API_KEY = process.env.API_KEY; // Sua chave da API do Binance
const SECRET_KEY = process.env.SECRET_KEY; // Sua chave secreta da API do Binance
const MAX_RISK_PERCENTAGE = 0.02; // Risco máximo permitido por operação (2% do capital total)
const CAPITAL = 1000; // Capital total disponível para trading

// Variáveis dinâmicas para controle de posição
let isOpened = false; // Indica se uma posição está aberta
let entryPrice = 0; // Preço de entrada na posição
let trailingStopLoss = null; // Stop-loss móvel para proteger os lucros

// Função para calcular a Média Móvel Simples (SMA)
function calcSMA(data, period) {
    const closes = data.map(c => parseFloat(c[4])); // Extrai os preços de fechamento
    const sum = closes.slice(-period).reduce((a, b) => a + b, 0); // Soma dos últimos 'period' fechamentos
    return sum / period; // Retorna a média
}

// Função para calcular a volatilidade com base no desvio padrão
function calcVolatility(data, period) {
    const closes = data.map(c => parseFloat(c[4])); // Extrai os preços de fechamento
    const mean = calcSMA(data, period); // Calcula a média (SMA)
    const variance = closes.slice(-period).reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period; // Variância
    return Math.sqrt(variance); // Desvio padrão como medida de volatilidade
}

// Função para calcular o Índice de Força Relativa (RSI)
function calcRSI(data, period) {
    const closes = data.map(c => parseFloat(c[4])); // Extrai os preços de fechamento
    let gains = 0, losses = 0;

    // Calcula os ganhos e perdas em sequência
    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gains += change; // Acumula ganhos
        else losses -= change; // Acumula perdas (invertendo sinal negativo)
    }

    // Calcula médias dos ganhos e perdas
    const avgGain = gains / period;
    const avgLoss = losses / period;

    // Calcula o RSI usando a fórmula padrão
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs)); // Fórmula do RSI
}

// Função para calcular o Índice Direcional Médio (ADX)
function calcADX(data, period) {
    const highs = data.map(c => parseFloat(c[2])); // Extrai os preços mais altos
    const lows = data.map(c => parseFloat(c[3])); // Extrai os preços mais baixos
    const closes = data.map(c => parseFloat(c[4])); // Extrai os preços de fechamento

    let trSum = 0, pdmSum = 0, ndmSum = 0;

    // Loop para calcular o True Range (TR), PD+ e ND-
    for (let i = 1; i < highs.length; i++) {
        const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
        const pdm = Math.max(highs[i] - highs[i - 1], 0); // Movimento positivo
        const ndm = Math.max(lows[i - 1] - lows[i], 0); // Movimento negativo

        trSum += tr; // Soma do True Range
        pdmSum += pdm > ndm ? pdm : 0; // Soma apenas os movimentos positivos se forem maiores
        ndmSum += ndm > pdm ? ndm : 0; // Soma apenas os movimentos negativos se forem maiores
    }

    // Calcula os índices de direção positiva e negativa
    const pdi = (pdmSum / trSum) * 100;
    const ndi = (ndmSum / trSum) * 100;

    // Calcula o DX como base para o ADX
    const dx = Math.abs(pdi - ndi) / (pdi + ndi) * 100;
    return dx; // Retorna o DX (normalmente suavizado em implementações completas)
}

// Função para buscar dados de mercado com base em um intervalo de tempo
async function fetchData(interval) {
    const { data } = await axios.get(API_URL + `/api/v3/klines?limit=50&interval=${interval}&symbol=${SYMBOL}`);
    return data;
}

// Função para registrar transações
function logTransaction(type, price, quantity) {
    const logFilePath = path.join(__dirname, 'trading_log4.csv'); // Usando o mesmo arquivo de log
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

// Função principal de execução periódica
async function start() {
    // Obtém os dados de curto e longo prazo
    const shortTermData = await fetchData("15m"); // Dados de 15 minutos
    const longTermData = await fetchData("1h"); // Dados de 1 hora

    const candle = shortTermData[shortTermData.length - 1]; // Último candle (barra)
    const price = parseFloat(candle[4]); // Preço de fechamento atual

    console.clear();
    console.log("Preço Atual: " + price);

    // Calcula as médias móveis e tendência de longo prazo
    const smaShort = calcSMA(shortTermData, 13); // SMA curta
    const smaLong = calcSMA(shortTermData, 50); // SMA longa
    const longTermTrend = calcSMA(longTermData, 50) > calcSMA(longTermData, 200); // Tendência de longo prazo

    console.log("SMA Curta: " + smaShort);
    console.log("SMA Longa: " + smaLong);
    console.log("Tendência Longa: " + longTermTrend);

    // Calcula volatilidade, RSI e ADX
    const volatility = calcVolatility(shortTermData, 21);
    console.log("Volatilidade: " + volatility);

    const rsi = calcRSI(shortTermData.slice(-14), 14); // RSI
    console.log("RSI: " + rsi);

    const adx = calcADX(shortTermData, 14); // ADX
    console.log("ADX: " + adx);

    const trendIsUp = smaShort > smaLong && longTermTrend; // Confirmação de tendência de alta

    // Condições de entrada na operação
    if (price < smaShort && trendIsUp && rsi < 30 && adx > 20 && !isOpened) {
        const stopLossDistance = volatility * 1.5; // Distância do stop-loss baseada na volatilidade
        const dynamicQuantity = Math.min((CAPITAL * MAX_RISK_PERCENTAGE) / stopLossDistance, CAPITAL / price); // Quantidade ajustada

        isOpened = true;
        entryPrice = price; // Define o preço de entrada
        trailingStopLoss = price - stopLossDistance; // Inicializa o trailing stop-loss
        newOrder(SYMBOL, dynamicQuantity, "BUY"); // Realiza a compra
        logTransaction("BUY", entryPrice, dynamicQuantity); // Registrar compra
    } 
    // Gerenciamento de posição aberta
    else if (isOpened) {
        const stopLossDistance = volatility * 1.5;
        const takeProfitPrice = entryPrice + (volatility * 2); // Preço de take-profit

        trailingStopLoss = Math.max(trailingStopLoss, price - stopLossDistance); // Atualiza o trailing stop

        console.log("Trailing Stop-Loss: " + trailingStopLoss);
        console.log("Take-Profit: " + takeProfitPrice);

        // Verifica se atingiu o trailing stop ou take-profit
        if (price <= trailingStopLoss) {
            newOrder(SYMBOL, INITIAL_QUANTITY, "SELL");
            logTransaction("SELL", price, INITIAL_QUANTITY); // Registrar venda
            isOpened = false;
            console.log("Trailing Stop ativado. Vendido a: " + price);
        } else if (price >= takeProfitPrice) {
            newOrder(SYMBOL, INITIAL_QUANTITY, "SELL");
            logTransaction("SELL", price, INITIAL_QUANTITY); // Registrar venda
            isOpened = false;
            console.log("Take-Profit ativado. Vendido a: " + price);
        }
    }
}

// Função para enviar ordens de mercado ao Binance
async function newOrder(symbol, quantity, side) {
    const order = { symbol, quantity, side, type: "MARKET", timestamp: Date.now() };

    // Cria uma assinatura usando a chave secreta
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

        console.log("Ordem executada:", data);
    } catch (err) {
        console.error("Erro ao executar ordem:", err.response?.data || err.message);
    }
}

// Executa a função principal em intervalos regulares
setInterval(start, 3000); // Intervalo de 3 segundos

// Inicia a execução imediatamente
start();
