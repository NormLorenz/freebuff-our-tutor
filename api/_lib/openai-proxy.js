/**
 * _lib/openai-proxy.js — shared OpenAI proxy implementation.
 *
 * Used by two places:
 *  - the Vercel Serverless Functions (api/chat.js, api/tutor.js), and
 *  - the local zero-dependency dev server (server.js),
 * so POST /api/chat and POST /api/tutor behave identically in both.
 *
 * The browser sends only { messages, max_completion_tokens, temperature }.
 * OPENAI_API_KEY and OPENAI_MODEL live server-side (Vercel environment
 * variables, or a .env file locally) and never reach the browser. Requests
 * are validated and rate-limited per IP before being forwarded to OpenAI.
 *
 * Node http-style handler: module.exports.handle(req, res).
 */
"use strict";

const https = require("https");

const OPENAI_HOST = "api.openai.com";
const OPENAI_PATH = "/v1/chat/completions";
const PROXY_BODY_LIMIT = 24 * 1024;      // max bytes of a client request
const PROXY_MAX_COMPLETION = 800;        // hard cap on reply tokens
const PROXY_MAX_MESSAGES = 41;           // system + last 10 turns + user
const PROXY_MAX_CHARS = 24 * 1000;       // hard cap on total prompt chars

/* Per-IP rate limit on the proxy endpoints (burglars metered per visit).
 * NOTE on Vercel: each serverless-function instance keeps its own counter,
 * so the limit is per instance rather than strictly global. */
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
          Authorization: "Bearer " + (process.env.OPENAI_API_KEY || ""),
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
  if (!process.env.OPENAI_API_KEY) {
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

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const maxCompletion = Math.min(
    Math.max(parseInt(body.max_completion_tokens, 10) || 320, 1),
    PROXY_MAX_COMPLETION
  );
  const payload = { model, messages, max_completion_tokens: maxCompletion };
  // gpt-5* models only accept their default temperature
  if (!/^gpt-5/.test(model)) {
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

module.exports = { handleOpenAiProxy };
