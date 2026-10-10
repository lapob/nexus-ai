import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = await realpath(resolve(root, "dist/client"));
const { default: worker } = await import(pathToFileURL(resolve(root, "dist/server/index.js")));
const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const hostname = option("--hostname", "127.0.0.1");
const port = Number(option("--port", "3000"));
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon" };
const env = { ASSETS: { async fetch(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  try {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path.includes("\\") || path.includes("\0")) return new Response(null, { status: 404 });
    const target = await realpath(resolve(assetsRoot, `.${path}`));
    const inside = relative(assetsRoot, target);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) return new Response(null, { status: 404 });
    const bytes = await readFile(target);
    return new Response(request.method === "HEAD" ? null : bytes, { headers: { "Content-Type": types[extname(target)] ?? "application/octet-stream" } });
  } catch { return new Response(null, { status: 404 }); }
} } };
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(new URL(incoming.url, `http://${hostname}:${port}`), { method: incoming.method, headers: incoming.headers });
    const response = await worker.fetch(request, env, { waitUntil() {}, passThroughOnException() {} });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    outgoing.writeHead(500, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    outgoing.end("NexusNXS temporarily unavailable");
  }
}).listen(port, hostname, () => console.log(`NexusNXS preview http://${hostname}:${port}`));
