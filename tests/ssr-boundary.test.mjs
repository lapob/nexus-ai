import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../dist/server/index.js";

const context = { waitUntil() {}, passThroughOnException() {} };
const env = { ASSETS: { fetch: async () => new Response("Missing", { status: 404 }) } };
const get = (path, method = "GET", options = env) => worker.fetch(new Request(`https://nexusnxs.com${path}`, { method, headers: { accept: "text/html" } }), options, context);

test("dependency boundary contains neither vulnerable chain after a locked install", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const path of Object.keys(lock.packages)) {
    assert.doesNotMatch(path, /node_modules\/(?:braces|micromatch|fast-glob|vinext|vite-plugin-commonjs|vite-plugin-dynamic-import|@next\/eslint-plugin-next)$/);
  }
});

test("page aliases preserve query strings and GET/HEAD have identical metadata", async () => {
  for (const [from, to] of [["/desktop/?source=1", "/desktop?source=1"], ["/pricing?source=1", "/downloads?source=1"]]) {
    const response = await get(from);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `https://nexusnxs.com${to}`);
  }
  for (const path of ["/", "/.well-known/security.txt", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/missing"]) {
    const response = await get(path);
    const head = await get(path, "HEAD");
    assert.equal(head.status, response.status);
    assert.equal(head.headers.get("content-type"), response.headers.get("content-type"));
    assert.equal(await head.text(), "");
    const post = await get(path, "POST");
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
  }
});

test("bootstrap, structured data and executable scripts share the response nonce", async () => {
  const response = await get('/?q=%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  const html = await response.text();
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy"))[1];
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
  assert.ok(scripts.length >= 3);
  for (const script of scripts) assert.match(script[1], new RegExp(`nonce="${nonce}"`));
  const serialized = /id="nexus-site-state"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
  assert.equal(JSON.parse(serialized).nonce, nonce);
  assert.ok(!serialized.includes("<"));
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
});

test("status transports one immutable display label rather than formatting in the browser", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ status: "ready" });
  try {
    const response = await get("/status");
    const html = await response.text();
    const snapshot = JSON.parse(/id="nexus-site-state"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]).status;
    assert.equal(snapshot.online, true);
    assert.ok(snapshot.checkedAtLabel.length > 10);
    assert.ok(html.includes(snapshot.checkedAt));
    assert.ok(html.includes(snapshot.checkedAtLabel));
  } finally { globalThis.fetch = originalFetch; }
});

test("asset aliases dispatch to ASSETS and missing API/files stay HTTP 404", async () => {
  const paths = [];
  const assets = { ASSETS: { fetch: async (request) => { paths.push(new URL(request.url).pathname); return new Response("PNG", { headers: { "Content-Type": "image/png" } }); } } };
  for (const path of ["/icon.png", "/apple-icon.png", "/products/android-home-astral.png"]) assert.equal((await get(path, "GET", assets)).headers.get("content-type"), "image/png");
  assert.deepEqual(paths, ["/nexus-icon.png", "/nexus-icon.png", "/products/android-home-astral.png"]);
  for (const path of ["/api/unknown", "/assets/missing.js"]) assert.equal((await get(path)).status, 404);
});
