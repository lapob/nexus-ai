import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("uses one account-owned Cloudflare Worker and no OpenAI Sites runtime", async () => {
  const [packageJson, viteConfig, wranglerConfig, worker] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  const packageData = JSON.parse(packageJson);
  const wrangler = JSON.parse(wranglerConfig);

  assert.equal(wrangler.name, "nexusnxs-site");
  assert.equal(wrangler.account_id, "7d844e420d105a64adc45a165e4cd8f6");
  assert.equal(wrangler.main, "./worker/index.ts");
  assert.equal(wrangler.workers_dev, false);
  assert.equal(wrangler.preview_urls, true);
  assert.equal(wrangler.version_metadata.binding, "CF_VERSION_METADATA");
  assert.deepEqual(wrangler.routes, [
    { pattern: "nexusnxs.com", custom_domain: true },
    { pattern: "www.nexusnxs.com", custom_domain: true },
    { pattern: "ai.nexusnxs.com/*", zone_name: "nexusnxs.com" },
  ]);
  assert.match(worker, /Il Core sta/);
  assert.match(worker, /X-NexusNXS-Edge-State/);
  assert.equal(wrangler.assets.binding, "ASSETS");
  assert.equal(wrangler.assets.html_handling, "none");
  assert.equal(wrangler.vars.NEXUSNXS_SITE_MODE, "live");
  assert.match(packageData.scripts.build, /clean-build\.mjs/);
  assert.ok(packageData.scripts["verify:release"]);
  assert.ok(packageData.scripts["release:prepare"]);
  assert.equal(packageData.devDependencies["@openai/sites-vite-plugin"], undefined);
  assert.doesNotMatch(`${viteConfig}\n${worker}`, /@openai\/sites-vite-plugin|sites\(\)|chatgpt\.site/i);

  await assert.rejects(
    access(new URL("../.openai/hosting.json", import.meta.url)),
    { code: "ENOENT" },
  );
});
