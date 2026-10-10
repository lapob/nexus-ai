import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--local", "--ip", "127.0.0.1", "--port", "41797"], {
  cwd: new URL("..", import.meta.url), windowsHide: true,
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
const origin = "http://127.0.0.1:41797";
try {
  let response;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Worker runtime exited ${child.exitCode}`);
    try { response = await fetch(origin, { signal: AbortSignal.timeout(1000) }); if (response.status === 200) break; } catch { /* Runtime may still be starting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.equal(response?.status, 200, "Actual Workers runtime must serve SSR");
  const html = await response.text();
  assert.match(html, /hero-product-name/);
  const data = JSON.parse(/id="nexus-site-state"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.ok(response.headers.get("content-security-policy").includes(`'nonce-${data.nonce}'`));
  for (const asset of [data.assets.script, ...data.assets.styles, "/nexus-icon.png"]) {
    const result = await fetch(origin + asset);
    assert.equal(result.status, 200, asset);
    assert.ok((await result.arrayBuffer()).byteLength > 0);
    assert.ok(result.headers.get("content-security-policy"), "Assets pass through the securing Worker");
  }
  const disclosure = await fetch(`${origin}/.well-known/security.txt`);
  assert.equal(disclosure.status, 200);
  assert.match(await disclosure.text(), /security@nexusnxs.com/);
  const unknown = await fetch(`${origin}/not-a-page`);
  assert.equal(unknown.status, 404);
  assert.match(await unknown.text(), /Pagina non trovata/);
  console.log("Actual local Cloudflare Workers SSR, assets, nonce, security route and 404: PASS");
} finally {
  child.kill();
  if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
}
