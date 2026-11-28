// Serves the web/ folder as plain static files, the way GitHub Pages does (no server mode, no
// /api). Used by Start-AutoUploadTest.ps1; listens on this PC only.
//
//   node scripts/serve-website.mjs [port]      (default 8790)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const port = Number(process.argv[2] ?? 8790);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  let path;
  try { path = normalize(decodeURIComponent(new URL(req.url, "http://localhost").pathname)).replace(/^[\\/]+/, ""); }
  catch { res.writeHead(400); return res.end(); }
  if (path.split(/[\\/]/).includes("..")) { res.writeHead(400); return res.end(); }
  const file = join(web, path || "index.html");
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`OSRS TaskMaster website (this folder): http://127.0.0.1:${port}/`));
