import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Nexus public homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="it">/i);
  assert.match(html, /NEXUS SOFTWARE/);
  assert.match(html, /Strumenti digitali/);
  assert.match(html, /Trust Center/);
  assert.match(html, /Nexus Desktop/);
  assert.match(html, /Nexus AI/);
  assert.doesNotMatch(html, /codex-preview|starter loading skeleton|Your site is taking shape/i);
});

test("keeps production metadata and portable scripts", async () => {
  const [layout, packageJson, chrome] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SiteChrome.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /Nexus — Software per menti libere/);
  assert.match(layout, /<html lang="it">/);
  assert.match(packageJson, /cross-env WRANGLER_LOG_PATH=/);
  assert.match(chrome, /next\/image/);
  assert.match(chrome, /next\/link/);
  assert.doesNotMatch(`${layout}\n${chrome}`, /codex-preview|_sites-preview/i);
});
