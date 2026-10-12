/**
 * dev-server.js — zero-dependency static file server for DeutschLust.
 * Start with: npm start  →  http://localhost:8000/public/
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8000;
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
  console.log("  DeutschLust dev server");
  console.log("  --------------------------------");
  console.log("  Home:      http://localhost:" + PORT + "/public/");
  console.log("  Root:      http://localhost:" + PORT + "/  (redirects home)");
  console.log("");
  console.log("  Tip: open the browser console (F12) and run");
  console.log('  localStorage.setItem("openaiApiKey", "sk-...")');
  console.log("  to enable live ChatGPT replies.");
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});
