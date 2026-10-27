// Servidor simples para ver dist/ como no ar: node scripts/serve.mjs [porta]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
const root = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };
const port = Number(process.argv[2] ?? 4321);
createServer(async (req, res) => {
  let p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    if ((await stat(p)).isDirectory()) p = join(p, "index.html");
    res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
    res.end(await readFile(p));
  } catch {
    res.writeHead(404, { "content-type": "text/html" });
    res.end(await readFile(join(root, "404.html")).catch(() => "Not found"));
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
