import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertAccountToken,
  readStoredAccountToken,
  resolveAccountToken,
  storeAccountToken,
} from "../scripts/cloudflare-credential.mjs";

const validToken = `cfat_${"A".repeat(40)}`;

test("accepts only account-owned Cloudflare tokens", () => {
  assert.equal(assertAccountToken(`  ${validToken}\n`), validToken);
  for (const value of ["", "personal-oauth-token", `cf_${"A".repeat(40)}`, "cfat_short", "cfat_bad value"]) {
    assert.throws(() => assertAccountToken(value), /account-owned API token/);
  }
});

test("uses an injected CI token before consulting the OS keyring", async () => {
  class ForbiddenEntry {
    constructor() {
      throw new Error("keyring must not be consulted");
    }
  }
  assert.equal(
    await resolveAccountToken({ env: { CLOUDFLARE_API_TOKEN: validToken }, EntryClass: ForbiddenEntry }),
    validToken,
  );
});

test("stores and retrieves the release token through a keyring entry without logging it", async () => {
  let stored = null;
  class FakeEntry {
    setPassword(value) { stored = value; }
    getPassword() { return stored; }
  }

  await storeAccountToken(validToken, { EntryClass: FakeEntry });
  assert.equal(await readStoredAccountToken({ EntryClass: FakeEntry }), validToken);
  assert.equal(await resolveAccountToken({ env: {}, EntryClass: FakeEntry }), validToken);
});

test("fails closed when no Cloudflare release credential exists", async () => {
  class EmptyEntry {
    getPassword() { return null; }
  }
  await assert.rejects(
    resolveAccountToken({ env: {}, EntryClass: EmptyEntry }),
    /credential missing/,
  );
});

test("keeps bootstrap, cutover, promotion, and rollback as distinct guarded stages", async () => {
  const [releaseScript, packageJson, verifier, wrangler] = await Promise.all([
    readFile(new URL("../scripts/cloudflare-release.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/verify-deployment.mjs", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;
  const config = JSON.parse(wrangler);

  assert.doesNotMatch(releaseScript, /spawnSync\(["'](?:npm|npx)\.cmd|shell:\s*true/);
  assert.match(releaseScript, /process\.env\.npm_execpath/);
  assert.match(releaseScript, /runNpm\(\["ls", "--depth=0"\]\)/);
  assert.doesNotMatch(releaseScript, /runNpm\(\["ci"/);
  assert.match(releaseScript, /node_modules["'], "wrangler["'], "bin["'], "wrangler\.js/);
  assert.match(releaseScript, /delete environment\.CLOUDFLARE_API_TOKEN/);
  assert.match(releaseScript, /await rm\(outputPath, \{ force: true \}\)/);
  assert.match(releaseScript, /--confirm-domain-cutover/);
  assert.match(releaseScript, /assertProductionDomainsAttached/);
  assert.match(releaseScript, /artifact \? "dist\/server\/wrangler\.json" : "wrangler\.jsonc"/);
  assert.match(releaseScript, /AggregateError/);
  assert.match(verifier, /x-nexusnxs-worker-version/);
  assert.match(verifier, /fetchWithTrustedDns/);

  assert.ok(scripts["release:bootstrap"]);
  assert.ok(scripts["release:activate-initial"]);
  assert.ok(scripts["release:cutover"]);
  assert.ok(scripts["release:promote"]);
  assert.ok(scripts["release:rollback"]);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, true);
  assert.equal(config.version_metadata.binding, "CF_VERSION_METADATA");
  assert.deepEqual(config.routes, [
    { pattern: "nexusnxs.com", custom_domain: true },
    { pattern: "www.nexusnxs.com", custom_domain: true },
  ]);
  assert.match(releaseScript, /routes\.length !== 0/);
});

test("verifies immutable Cloudflare previews before promotion", async () => {
  const release = await readFile(new URL("../scripts/cloudflare-release.mjs", import.meta.url), "utf8");
  assert.match(release, /event\?\.preview_url \?\? event\?\.preview_alias_url/);
  assert.match(release, /verifySite\(candidate\.preview_url, candidate\.version_id\)/);
});
