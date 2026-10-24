/**
 * server.js — zero-dependency local dev server for GutenTag.
 * Start with: npm start  →  http://localhost:3000/public/
 *
 * Serves ./public and proxies POST /api/chat + POST /api/tutor to OpenAI
 * using the same handler as the Vercel Serverless Functions
 * (api/_lib/openai-proxy.js) — so local and production behave identically.
 *
 * Loads ./.env (KEY=VALUE lines) into process.env, the way Vercel injects
 * its environment variables in production. OPENAI_API_KEY + OPENAI_MODEL
 * stay in the server process and are never sent to the browser.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleOpenAiProxy } = require("./api/_lib/openai-proxy.js");

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
/* Mirrors Vercel: local .env values fill in missing process.env vars. */
/* ------------------------------------------------------------------ */
function loadEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (_) { /* no .env — fall back to localStorage-based setup */ }
}
loadEnvFile();

const PORT = process.env.PORT || 8000;

function safeJoin(root, urlPath) {
  // Resolve and confine to the project root (path traversal guard)
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const resolved = path.resolve(root, "." + decoded);
  if (!resolved.startsWith(path.resolve(root) + path.sep) && resolved !== path.resolve(root)) {
    return null;
  }
  return resolved;
}

const server = http.createServer((req, res) => {
  // Friendly entry point: "/" and "/public" redirect to "/public/" so the
  // browser actually lands there. index.html references its assets with
  // relative paths (css/, js/, images/) — serving it at the root URL would
  // make those resolve to /css/styles.css etc. and 404. (Vercel serves the
  // contents of public/ at the site root, so no redirect is needed there.)
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]).split("#")[0];
  if (urlPath === "/" || urlPath === "/public") {
    res.writeHead(301, { Location: "/public/" });
    return res.end();
  }

  // AI proxy endpoints — same handler as the Vercel functions
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
  console.log("");
  console.log("  AI proxy:  /api/chat + /api/tutor (same handler as the Vercel");
  console.log("             serverless functions — key stays server-side)");
  if (process.env.OPENAI_API_KEY) {
    console.log("  OpenAI key loaded from .env → live ChatGPT replies enabled.");
    if (process.env.OPENAI_MODEL) console.log("  Model:             " + process.env.OPENAI_MODEL);
  } else {
    console.log("  No .env credentials found. The bots run in offline/practice");
    console.log("  mode until OPENAI_API_KEY is set in .env (or as a Vercel");
    console.log("  environment variable in production). A personal key via");
    console.log('  localStorage still works as a direct-connect dev override:');
    console.log('    localStorage.setItem("openaiApiKey", "sk-...")');
  }
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});
