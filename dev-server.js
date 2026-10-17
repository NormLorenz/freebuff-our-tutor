/**
 * dev-server.js — zero-dependency static file server for GutenTag.
 * Start with: npm start  →  http://localhost:8000/public/
 *
 * Loads ./.env (KEY=VALUE lines) and injects OPENAI_API_KEY + OPENAI_MODEL
 * into served HTML as window.OPENAI_API_KEY / window.OPENAI_MODEL so the
 * chat bot and AI tutor use live ChatGPT replies without committing secrets.
 */
const http = require("http");
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
const OPENAI_MODEL = process.env.OPENAI_MODEL || envFile.OPENAI_MODEL || "";

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

  // Friendly entry points: exactly "/" or "/public" redirect to the site home
  if (!isDir && (pathname === rootResolved || pathname === path.join(rootResolved, "public"))) {
    res.writeHead(301, { Location: "/public/" });
    return res.end();
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 Not Found: " + req.url);
    }
    // Inject the .env-provided OpenAI credentials into served HTML only.
    // (Applying this to every file would round-trip binary data through
    // a string and corrupt images, fonts, SVGs, etc.)
    const ext = path.extname(filePath).toLowerCase();
    if ((OPENAI_API_KEY || OPENAI_MODEL) && ext === ".html") {
      let html = data.toString("utf8");
      const inject = "<script>" +
        (OPENAI_API_KEY ? "window.OPENAI_API_KEY=" + JSON.stringify(OPENAI_API_KEY) + ";" : "") +
        (OPENAI_MODEL ? "window.OPENAI_MODEL=" + JSON.stringify(OPENAI_MODEL) + ";" : "") +
        "</script>";
      // Prefer the head slug; fall back to the first <script> tag.
      if (html.includes("</head>")) html = html.replace("</head>", inject + "\n</head>");
      else html = html.replace("<script>", inject + "\n<script>");
      data = Buffer.from(html, "utf8");
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
  if (OPENAI_API_KEY) {
    console.log("  OpenAI key loaded from .env → live ChatGPT replies enabled.");
    if (OPENAI_MODEL) console.log("  Model:             " + OPENAI_MODEL);
  } else {
    console.log("  No .env credentials found. For live ChatGPT replies,");
    console.log("  either add OPENAI_API_KEY to .env, or open the browser");
    console.log("  console (F12) and run");
    console.log('  localStorage.setItem("openaiApiKey", "sk-...")');
  }
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});
