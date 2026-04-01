const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MAX_CANDLES = 300;
let candles = [];
let currentCandle = null;

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

app.post("/webhook", (req, res) => {
  try {
    const body = req.body;
    const price = parseFloat(body.price || body.close);
    const open = parseFloat(body.open || price);
    const high = parseFloat(body.high || price);
    const low = parseFloat(body.low || price);
    const volume = parseFloat(body.volume || 5000);
    const time = body.time ? new Date(body.time).getTime() : Date.now();
    if (isNaN(price)) return res.status(400).json({ error: "Invalid price" });
    const candle = { open, high, low, close: price, volume, time };
    if (currentCandle && time - currentCandle.time < 60000) {
      currentCandle.close = price;
      currentCandle.high = Math.max(currentCandle.high, high);
      currentCandle.low = Math.min(currentCandle.low, low);
      currentCandle.volume += volume;
      candles[candles.length - 1] = currentCandle;
    } else {
      currentCandle = { ...candle };
      candles.push(currentCandle);
      if (candles.length > MAX_CANDLES) candles.shift();
    }
    broadcast({ type: "candle", candles });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify(candles.length > 0
    ? { type: "init", candles }
    : { type: "waiting" }
  ));
});

app.get("/", (req, res) => {
  res.json({ status: "running", candles: candles.length });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log("GC Server running on port " + PORT));
