/**
 * server.js — zero-dependency static file server + OpenAI proxy for GutenTag.
 * Start with: npm start  →  http://localhost:8000/public/
 *
 * Loads ./.env (KEY=VALUE lines). The OPENAI_API_KEY + OPENAI_MODEL stay in
 * the server process and are never sent to the browser: the client-side
 * chat modules POST to /api/chat and /api/tutor, which forward the request
 * to OpenAI with the Authorization header attached server-side.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/* ------------------------------------------------------------------ */
/* Tiny .env loader — "KEY=VALUE" lines, "#" comments ignored.         */
/* ------------------------------------------------------------------ */
function loadEnvFile() {
  const vars = {};
  if (process.env.OPENAI_API_KEY) return vars; // real env wins; skip file
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch (_) { /* no .env — fall back to localStorage-based setup */ }
  return vars;
}
const envFile = loadEnvFile();

const PORT = process.env.PORT || parseInt(envFile.PORT, 10) || 8000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || envFile.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || envFile.OPENAI_MODEL || "gpt-4o-mini";

function safeJoin(root, urlPath) {
  // Resolve and confine to the project root (path traversal guard)
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const resolved = path.resolve(root, "." + decoded);
  if (!resolved.startsWith(path.resolve(root) + path.sep) && resolved !== path.resolve(root)) {
    return null;
  }
  return resolved;
}

/* ------------------------------------------------------------------ */
/* OpenAI proxy — POST /api/chat and /api/tutor                        */
/* The browser sends only { messages, max_completion_tokens, heat }.    */
/* The key/model live here and are never exposed to the browser.        */
/* ------------------------------------------------------------------ */
const OPENAI_HOST = "api.openai.com";
const OPENAI_PATH = "/v1/chat/completions";
const PROXY_BODY_LIMIT = 24 * 1024;      // max bytes of a client request
const PROXY_MAX_COMPLETION = 800;        // hard cap on reply tokens
const PROXY_MAX_MESSAGES = 41;           // system + last 10 turns + user
const PROXY_MAX_CHARS = 24 * 1000;       // hard cap on total prompt chars

/* Per-IP rate limit on the proxy endpoints (burglars metered per visit). */
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 30;
const rateHits = new Map(); // ip -> [timestamp, …]

function allowRate(ip) {
  const now = Date.now();
  const hits = (rateHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX_REQUESTS) {
    rateHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  rateHits.set(ip, hits);
  return true;
}

function sendJson(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (_) {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function validateMessages(body) {
  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > PROXY_MAX_MESSAGES) return null;
  let totalChars = 0;
  for (const m of messages) {
    if (!m || typeof m !== "object") return null;
    if (!["system", "user", "assistant"].includes(m.role)) return null;
    if (typeof m.content !== "string") return null;
    totalChars += m.content.length;
  }
  if (totalChars > PROXY_MAX_CHARS) return null;
  return messages;
}

function forwardToOpenAI(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        host: OPENAI_HOST,
        path: OPENAI_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + OPENAI_API_KEY,
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") });
          } catch (_) {
            reject(new Error("bad OpenAI response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(60000, () => req.destroy(new Error("OpenAI timeout")));
    req.end(data);
  });
}

async function handleOpenAiProxy(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method not allowed" });
  }
  const ip = req.socket.remoteAddress || "unknown";
  if (!allowRate(ip)) {
    return sendJson(res, 429, { error: "too many requests — try again in a minute" });
  }
  if (!OPENAI_API_KEY) {
    return sendJson(res, 501, { error: "not_configured" });
  }

  let body;
  try {
    body = await readJsonBody(req, PROXY_BODY_LIMIT);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const messages = validateMessages(body);
  if (!messages) {
    return sendJson(res, 400, { error: "invalid messages array" });
  }

  const maxCompletion = Math.min(
    Math.max(parseInt(body.max_completion_tokens, 10) || 320, 1),
    PROXY_MAX_COMPLETION
  );
  const payload = { model: OPENAI_MODEL, messages, max_completion_tokens: maxCompletion };
  // gpt-5* models only accept their default temperature
  if (!/^gpt-5/.test(OPENAI_MODEL)) {
    const temperature = parseFloat(body.temperature);
    if (!isNaN(temperature)) payload.temperature = Math.min(Math.max(temperature, 0), 2);
  }

  try {
    const out = await forwardToOpenAI(payload);
    const reply = out.json && out.json.choices &&
      out.json.choices[0] && out.json.choices[0].message &&
      out.json.choices[0].message.content;
    if (out.status !== 200 || !reply) {
      return sendJson(res, out.status === 401 ? 502 : out.status || 502, {
        error: "openai_error",
        status: out.status || 0,
      });
    }
    return sendJson(res, 200, { reply: reply.trim() });
  } catch (_) {
    return sendJson(res, 502, { error: "openai_unreachable" });
  }
}

const server = http.createServer((req, res) => {
  // Friendly entry points: "/" and "/public" redirect to "/public/" so the
  // browser actually lands there. index.html references its assets with
  // relative paths (css/, js/, images/) — serving it at the root URL would
  // make those resolve to /css/styles.css etc. and 404.
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]).split("#")[0];
  if (urlPath === "/" || urlPath === "/public") {
    res.writeHead(301, { Location: "/public/" });
    return res.end();
  }

  // AI proxy endpoints (same origin — no CORS, no exposed credentials)
  if (urlPath === "/api/chat" || urlPath === "/api/tutor") {
    handleOpenAiProxy(req, res);
    return;
  }

  const pathname = safeJoin(ROOT, req.url || "/");
  if (!pathname) {
    res.writeHead(403);
    return res.end("403 Forbidden");
  }

  // Directory URLs (e.g. "/public/") get served by public/index.html
  const rootResolved = path.resolve(ROOT);
  let filePath = pathname;
  const isDir = pathname.endsWith(path.sep) || (fs.existsSync(pathname) && fs.statSync(pathname).isDirectory());
  if (isDir) {
    filePath = path.join(rootResolved, "public", "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 Not Found: " + req.url);
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("");
    console.error("  Oops — port " + PORT + " is already in use (is another server running?)");
    console.error("  Try a different port:   PORT=3000 npm start");
    console.error("  Or stop the other server and run npm start again.");
    console.error("");
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log("");
  console.log("  GutenTag dev server");
  console.log("  --------------------------------");
  console.log("  Home:      http://localhost:" + PORT + "/public/");
  console.log("  Root:      http://localhost:" + PORT + "/  (redirects home)");
  console.log("  Railway:   bare root URL redirects home automatically");
  console.log("");
  console.log("  AI proxy:  /api/chat + /api/tutor (OpenAI key stays server-side)");
  if (OPENAI_API_KEY) {
    console.log("  OpenAI key loaded from .env → live ChatGPT replies enabled.");
    if (OPENAI_MODEL) console.log("  Model:             " + OPENAI_MODEL);
  } else {
    console.log("  No .env credentials found. The bots run in offline/practice");
    console.log("  mode until OPENAI_API_KEY is set in .env (or the Railway");
    console.log("  environment). A personal key via localStorage still works");
    console.log('  as a direct-connect dev override:');
    console.log('    localStorage.setItem("openaiApiKey", "sk-...")');
  }
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});
