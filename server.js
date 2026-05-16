// ╔══════════════════════════════════════════════════════════════╗
// ║  MASTER EDGE — TradingView → Telegram Alert Server         ║
// ║  Receives TV webhooks and forwards to your Telegram bot    ║
// ╚══════════════════════════════════════════════════════════════╝

const http  = require("http");
const https = require("https");

// ── CONFIG ────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN || "8645031589:AAFEMCMJjRLz871xbbwMjLlrUookUApRMkM";
const CHAT_ID   = process.env.CHAT_ID   || "";
const PORT      = process.env.PORT      || 3000;
const SECRET    = process.env.SECRET    || "masteredge2025";

// ── TELEGRAM SENDER ───────────────────────────────────────────
function sendTelegram(chatId, text) {
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });
  const opts = {
    hostname: "api.telegram.org",
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── FORMAT ALERT MESSAGE ──────────────────────────────────────
function formatAlert(payload) {
  const type  = (payload.type   || "ALERT").toUpperCase();
  const pair  = (payload.pair   || payload.ticker || "—").toUpperCase();
  const price =  payload.price  || payload.close  || "—";
  const tf    =  payload.tf     || payload.interval || "—";
  const score =  payload.score  || "—";
  const time  =  payload.time   || new Date().toUTCString();

  const isBuy  = type.includes("BUY")  || type.includes("BULL");
  const isSell = type.includes("SELL") || type.includes("BEAR");

  const emoji = isBuy  ? "🟢" :
                isSell ? "🔴" :
                type.includes("OTE")     ? "🎯" :
                type.includes("CISD")    ? "⚡" :
                type.includes("JUDAS")   ? "🪤" :
                type.includes("SILVER")  ? "🥈" :
                type.includes("BREAKER") ? "💥" :
                type.includes("CHoCH")   ? "🔄" :
                type.includes("SPRING")  ? "🌀" : "📡";

  const lines = [
    `${emoji} MASTER EDGE ALERT`,
    ``,
    `Signal : ${type}`,
    `Pair   : ${pair}`,
    `Price  : ${price}`,
    `TF     : ${tf}`,
  ];

  if (score !== "—")  lines.push(`Score  : ${score}%`);
  if (payload.entry)  lines.push(`Entry  : ${payload.entry}`);
  if (payload.sl)     lines.push(`SL     : ${payload.sl}`);
  if (payload.tp1)    lines.push(`TP1    : ${payload.tp1}`);
  if (payload.tp2)    lines.push(`TP2    : ${payload.tp2}`);
  if (payload.tp3)    lines.push(`TP3    : ${payload.tp3}`);

  lines.push(``, `Time   : ${time}`);
  if (isBuy || isSell) lines.push(``, `⚡ Check chart — look for OB/FVG/OTE retest entry`);

  return lines.join("\n");
}

// ── CHAT REGISTRY ─────────────────────────────────────────────
const knownChats = new Set();
if (CHAT_ID) knownChats.add(CHAT_ID);

// ── TELEGRAM POLLING ──────────────────────────────────────────
let lastUpdateId = 0;

async function pollTelegram() {
  const opts = {
    hostname: "api.telegram.org",
    path: `/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=25`,
    method: "GET"
  };
  return new Promise(resolve => {
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(d);
          if (json.ok && json.result.length > 0) {
            for (const update of json.result) {
              lastUpdateId = update.update_id;
              const msg = update.message;
              if (msg && msg.text) {
                const chatId = String(msg.chat.id);
                if (msg.text.startsWith("/start")) {
                  knownChats.add(chatId);
                  sendTelegram(chatId,
                    `✅ MASTER EDGE Bot connected!\n\n` +
                    `Your Chat ID: ${chatId}\n\n` +
                    `You will now receive:\n` +
                    `🟢 Buy signals\n🔴 Sell signals\n🎯 OTE alerts\n` +
                    `⚡ CISD alerts\n🪤 Judas Swing\n🥈 Silver Bullet\n` +
                    `💥 Breaker Blocks\n🔄 CHoCH alerts\n\n` +
                    `Alerts arrive in real time. You are all set.`
                  ).catch(console.error);
                  console.log(`[BOT] Registered: ${chatId}`);
                } else if (msg.text.startsWith("/status")) {
                  sendTelegram(chatId,
                    `📊 MASTER EDGE Status\n\nServer: Online ✅\nChats registered: ${knownChats.size}\nYour Chat ID: ${chatId}`
                  ).catch(console.error);
                } else if (msg.text.startsWith("/chatid")) {
                  sendTelegram(chatId, `Your Chat ID: ${chatId}`).catch(console.error);
                }
              }
            }
          }
          resolve();
        } catch(e) { resolve(); }
      });
    });
    req.on("error", () => resolve());
    req.setTimeout(30000, () => { req.destroy(); resolve(); });
    req.end();
  });
}

async function startPolling() {
  console.log("[BOT] Polling started");
  while (true) {
    await pollTelegram().catch(console.error);
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ── HTTP SERVER ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("MASTER EDGE Alert Server — Online ✅");
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/webhook")) {
    const url    = new URL(req.url, "http://localhost");
    const secret = url.searchParams.get("secret");
    if (secret && secret !== SECRET) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");

      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { type: body.trim() };
        const typeMatch  = body.match(/^(\w[\w\s]*?)(?:\s*\||\n|$)/);
        const pairMatch  = body.match(/\|\s*([A-Z]{3,6})\s*\|/);
        const priceMatch = body.match(/\|\s*([\d.]+)\s*\|/);
        const tfMatch    = body.match(/TF:([\w]+)/);
        if (typeMatch)  payload.type  = typeMatch[1].trim();
        if (pairMatch)  payload.pair  = pairMatch[1].trim();
        if (priceMatch) payload.price = priceMatch[1].trim();
        if (tfMatch)    payload.tf    = tfMatch[1].trim();
      }

      console.log(`[WEBHOOK] ${payload.type || body.substring(0, 60)}`);
      const text = formatAlert(payload);

      for (const chatId of knownChats) {
        await sendTelegram(chatId, text).catch(e => console.error(`[ERROR] ${chatId}:`, e.message));
      }

      if (knownChats.size === 0) {
        console.warn("[WARN] No chats registered — send /start to your bot on Telegram");
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
  console.log(`[SERVER] Webhook: /webhook?secret=${SECRET}`);
  startPolling();
});