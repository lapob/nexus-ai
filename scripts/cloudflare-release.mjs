import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLOUDFLARE_ACCOUNT_ID,
  resolveAccountToken,
} from "./cloudflare-credential.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const statePath = resolve(root, ".wrangler", "release-candidate.json");
const git = process.platform === "win32" ? "git.exe" : "git";
const npmCli = process.env.npm_execpath;
const wranglerCli = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
const workerName = "nexusnxs-site";
const productionHostnames = ["www.nexusnxs.com", "nexusnxs.com"];
const zoneId = "544b901eff88c7f156348b4dfc6184fe";
const aiRoutePattern = "ai.nexusnxs.com/*";
let accountToken;

function childEnvironment(extra = {}) {
  const environment = { ...process.env, NO_COLOR: "1", ...extra };
  delete environment.CLOUDFLARE_API_TOKEN;
  if (extra.CLOUDFLARE_API_TOKEN) {
    environment.CLOUDFLARE_API_TOKEN = extra.CLOUDFLARE_API_TOKEN;
  }
  return environment;
}

function run(command, args, { capture = false, allowFailure = false, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: childEnvironment(env),
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result;
}

function output(command, args) {
  return run(command, args, { capture: true }).stdout.trim();
}

function runNpm(args, options) {
  if (!npmCli) {
    throw new Error("Run release actions through the npm scripts so npm_execpath is available.");
  }
  return run(process.execPath, [npmCli, ...args], options);
}

function runWrangler(args, { artifact = false, ...options } = {}) {
  if (!accountToken) throw new Error("Cloudflare account credential was not loaded.");
  const config = artifact ? "dist/server/wrangler.json" : "wrangler.jsonc";
  return run(process.execPath, [wranglerCli, ...args, "--config", config], {
    ...options,
    env: { ...options.env, CLOUDFLARE_API_TOKEN: accountToken },
  });
}

function outputWrangler(...args) {
  return runWrangler(args, { capture: true }).stdout.trim();
}

async function ensureAccountToken() {
  accountToken ??= await resolveAccountToken();
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function verifySite(url, versionId, { attempts = 1 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = run(
      process.execPath,
      ["scripts/verify-deployment.mjs", url, versionId, "--skip-ai"],
      { allowFailure: true },
    );
    if (result.status === 0) return;
    if (attempt < attempts) {
      console.warn(`Site verification attempt ${attempt}/${attempts} failed; retrying.`);
      await delay(5_000);
    }
  }
  throw new Error(`Site verification failed after ${attempts} attempt(s): ${url}`);
}

async function verifyAiHealth(expectedVersion, { attempts = 1 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch("https://ai.nexusnxs.com/readyz", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => null);
      if (response.status !== 200 || payload?.status !== "ready") {
        throw new Error(`ai.nexusnxs.com health gate failed with status ${response.status}.`);
      }
      if (expectedVersion && response.headers.get("x-nexusnxs-worker-version") !== expectedVersion) {
        throw new Error("ai.nexusnxs.com is not passing through the expected NexusNXS edge version.");
      }
      if (expectedVersion && response.headers.get("x-nexusnxs-edge-state") !== "online") {
        throw new Error("ai.nexusnxs.com did not report an online edge state.");
      }
      console.log("AI service verified independently: https://ai.nexusnxs.com/healthz");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(`AI edge verification attempt ${attempt}/${attempts} failed; retrying.`);
        await delay(5_000);
      }
    }
  }
  throw lastError ?? new Error("AI edge verification failed.");
}

function assertCleanSource() {
  if (output(git, ["status", "--porcelain"])) {
    throw new Error("Commit or intentionally discard every source change before releasing.");
  }
}

function verifyRelease() {
  runNpm(["ls", "--depth=0"]);
  runNpm(["run", "verify:release"]);
}

async function assertBootstrapConfiguration(pathname) {
  const config = JSON.parse(await readFile(pathname, "utf8"));
  const routes = Array.isArray(config.routes) ? config.routes : config.routes ? [config.routes] : [];
  if (config.name !== workerName || config.account_id !== CLOUDFLARE_ACCOUNT_ID) {
    throw new Error(`Bootstrap configuration ${pathname} targets the wrong Worker or Cloudflare account.`);
  }
  if (
    config.workers_dev !== false ||
    config.preview_urls !== true ||
    routes.length !== 0 ||
    config.version_metadata?.binding !== "CF_VERSION_METADATA"
  ) {
    throw new Error(`Bootstrap configuration ${pathname} must use version metadata, versioned previews, no workers.dev alias, and no production routes.`);
  }
}

async function parseUploadEvent(pathname) {
  const lines = (await readFile(pathname, "utf8")).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => JSON.parse(line)).findLast((event) => event.type === "version-upload");
}

async function cloudflareRequest(pathname, init = {}) {
  if (!accountToken) throw new Error("Cloudflare account credential was not loaded.");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accountToken}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { errors: [{ message: text.slice(0, 300) }] };
  }
  return { response, payload };
}

async function cloudflareZoneRequest(pathname, init = {}) {
  if (!accountToken) throw new Error("Cloudflare account credential was not loaded.");
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accountToken}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function workerRoutes() {
  const { response, payload } = await cloudflareZoneRequest("/workers/routes");
  if (!response.ok || payload.success === false || !Array.isArray(payload.result)) {
    throw new Error(`Unable to read Worker routes (${response.status}): ${JSON.stringify(payload.errors ?? [])}`);
  }
  return payload.result;
}

async function hasAiRoute() {
  return (await workerRoutes()).some((route) => route.pattern === aiRoutePattern && route.script === workerName);
}

async function attachAiRoute() {
  const { response, payload } = await cloudflareZoneRequest("/workers/routes", {
    method: "POST",
    body: JSON.stringify({ pattern: aiRoutePattern, script: workerName }),
  });
  if (!response.ok || payload.success === false) {
    throw new Error(`Unable to attach ${aiRoutePattern} (${response.status}): ${JSON.stringify(payload.errors ?? [])}`);
  }
}

async function removeAiRoute() {
  const route = (await workerRoutes()).find((item) => item.pattern === aiRoutePattern && item.script === workerName);
  if (!route?.id) return;
  const { response, payload } = await cloudflareZoneRequest(`/workers/routes/${route.id}`, { method: "DELETE" });
  if (!response.ok || payload.success === false) {
    throw new Error(`Unable to restore the previous AI route state (${response.status}).`);
  }
}

async function purgeProductionCache() {
  const { response, payload } = await cloudflareZoneRequest("/purge_cache", {
    method: "POST",
    body: JSON.stringify({ purge_everything: true }),
  });
  if (!response.ok || payload.success === false) {
    throw new Error(`Unable to purge the NexusNXS production cache (${response.status}): ${JSON.stringify(payload.errors ?? [])}`);
  }
}

async function assertWorkerDoesNotExist() {
  const { response, payload } = await cloudflareRequest(`/workers/scripts/${workerName}/settings`);
  if (response.status === 404) return;
  if (response.ok && payload.success !== false) {
    throw new Error(`${workerName} already exists; bootstrap is intentionally one-time only.`);
  }
  throw new Error(`Unable to verify Worker bootstrap state (${response.status}): ${JSON.stringify(payload.errors ?? [])}`);
}

async function workerDomains() {
  const { response, payload } = await cloudflareRequest("/workers/domains");
  if (!response.ok || payload.success === false || !Array.isArray(payload.result)) {
    throw new Error(`Unable to read Worker custom domains (${response.status}): ${JSON.stringify(payload.errors ?? [])}`);
  }
  return payload.result;
}

async function assertProductionDomainsAttached() {
  const domains = await workerDomains();
  for (const hostname of productionHostnames) {
    const match = domains.find((domain) => domain.hostname === hostname);
    if (!match || match.service !== workerName) {
      throw new Error(`${hostname} is not attached to ${workerName}; use the one-time cutover flow first.`);
    }
  }
}

async function loadCandidate() {
  const candidate = JSON.parse(await readFile(statePath, "utf8"));
  if (!/^[0-9a-f-]{32,36}$/i.test(candidate.version_id ?? "")) {
    throw new Error("The release candidate state has no valid Cloudflare version ID.");
  }
  const preview = new URL(candidate.preview_url);
  if (preview.protocol !== "https:" || !preview.hostname.endsWith(".workers.dev")) {
    throw new Error("The release candidate state has no valid Cloudflare Preview URL.");
  }
  const sha = output(git, ["rev-parse", "HEAD"]);
  if (candidate.source_commit !== sha) {
    throw new Error("Candidate and current Git commit differ; prepare a new candidate.");
  }
  return { candidate, sha };
}

async function currentVersion() {
  const deployments = JSON.parse(outputWrangler("deployments", "list", "--json"));
  const current = [...deployments].sort((left, right) =>
    Date.parse(right.created_on ?? right.created_at ?? 0) - Date.parse(left.created_on ?? left.created_at ?? 0)
  )[0];
  const active = current?.versions ?? [];
  if (active.length !== 1 || Number(active[0].percentage) !== 100) {
    throw new Error("The current deployment is not a single version at 100%; review it manually.");
  }
  return active[0].version_id;
}

async function bootstrap() {
  assertCleanSource();
  await assertBootstrapConfiguration(resolve(root, "wrangler.jsonc"));
  verifyRelease();
  await assertBootstrapConfiguration(resolve(root, "dist", "server", "wrangler.json"));
  await ensureAccountToken();
  await assertWorkerDoesNotExist();
  const sha = output(git, ["rev-parse", "--short=12", "HEAD"]);
  runWrangler(["deploy", "--strict", "--message", `bootstrap ${sha}`], { artifact: true });
  console.log("Worker bootstrap complete. Upload a tested candidate before attaching domains.");
}

async function prepare() {
  assertCleanSource();
  verifyRelease();
  await ensureAccountToken();
  const sha = output(git, ["rev-parse", "HEAD"]);
  const shortSha = sha.slice(0, 12);
  const outputPath = resolve(root, ".wrangler", `version-upload-${shortSha}.ndjson`);
  await mkdir(dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  runWrangler([
    "versions", "upload",
    "--strict",
    "--preview-alias", "candidate",
    "--tag", `site-${shortSha}`,
    "--message", `candidate ${shortSha}`,
  ], { artifact: true, env: { WRANGLER_OUTPUT_FILE_PATH: outputPath } });
  const event = await parseUploadEvent(outputPath);
  // The named preview alias can retain an older edge mapping briefly after a
  // version upload. Gate and promote the immutable version URL instead so the
  // verified bytes always match version_id.
  const previewUrl = event?.preview_url ?? event?.preview_alias_url;
  if (!event?.version_id || !previewUrl) throw new Error("Wrangler did not return a version ID and Preview URL.");
  const candidate = {
    source_commit: sha,
    version_id: event.version_id,
    preview_url: previewUrl,
    created_at: new Date().toISOString(),
  };
  await writeFile(statePath, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600 });
  console.log(`Candidate ready: ${candidate.preview_url}`);
  console.log(`Version: ${candidate.version_id}`);
}

async function activateInitial() {
  assertCleanSource();
  await ensureAccountToken();
  const { candidate, sha } = await loadCandidate();
  const domains = await workerDomains();
  if (domains.some((domain) => productionHostnames.includes(domain.hostname))) {
    throw new Error("A NexusNXS production hostname is already attached; use release:promote instead.");
  }
  await verifySite(candidate.preview_url, candidate.version_id);
  await verifyAiHealth();
  const previous = await currentVersion();
  runWrangler([
    "versions", "deploy", `${candidate.version_id}@100%`,
    "--yes", "--message", `initial production ${sha.slice(0, 12)}`,
  ]);
  await writeFile(statePath, `${JSON.stringify({ ...candidate, previous_version: previous, activated_at: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  console.log(`Initial candidate activated without domain traffic: ${candidate.version_id}`);
}

async function attachDomain(hostname) {
  const { response, payload } = await cloudflareRequest("/workers/domains", {
    method: "PUT",
    body: JSON.stringify({ hostname, service: workerName, zone_name: "nexusnxs.com" }),
  });
  if (!response.ok || payload.success === false) {
    throw new Error(`Unable to attach ${hostname} (${response.status}): ${JSON.stringify(payload.errors ?? [])}`);
  }
}

async function deleteDomain(domain) {
  const { response, payload } = await cloudflareRequest(`/workers/domains/${domain.id}`, { method: "DELETE" });
  if (!response.ok || payload.success === false) {
    throw new Error(`Unable to refresh ${domain.hostname} (${response.status}): ${JSON.stringify(payload.errors ?? [])}`);
  }
}

async function refreshProductionTriggers() {
  const domains = await workerDomains();
  const targets = productionHostnames.map((hostname) => domains.find((domain) => domain.hostname === hostname));
  if (targets.some((domain) => !domain || domain.service !== workerName)) {
    throw new Error("Production trigger refresh refused because domain ownership does not match the NexusNXS Worker.");
  }
  await removeAiRoute();
  await attachAiRoute();
  for (const domain of targets) {
    await deleteDomain(domain);
    await attachDomain(domain.hostname);
  }
  await assertProductionDomainsAttached();
  if (!(await hasAiRoute())) throw new Error(`${aiRoutePattern} was not restored on ${workerName}.`);
}

async function cutover() {
  if (!process.argv.includes("--confirm-domain-cutover")) {
    throw new Error("Cutover changes public routing. Re-run with --confirm-domain-cutover after the old apex/www DNS records are removed.");
  }
  assertCleanSource();
  await ensureAccountToken();
  const { candidate } = await loadCandidate();
  if (await currentVersion() !== candidate.version_id) {
    throw new Error("The tested candidate is not the active Worker version; run release:activate-initial first.");
  }
  const existing = await workerDomains();
  for (const hostname of productionHostnames) {
    const match = existing.find((domain) => domain.hostname === hostname);
    if (match && match.service !== workerName) {
      throw new Error(`${hostname} is already attached to another Worker service.`);
    }
    if (!match) await attachDomain(hostname);
  }
  await assertProductionDomainsAttached();
  await verifySite("https://nexusnxs.com", candidate.version_id, { attempts: 6 });
  await verifyAiHealth();
  console.log(`Domain cutover complete: ${productionHostnames.join(", ")} -> ${workerName}.`);
}

async function promote() {
  assertCleanSource();
  await ensureAccountToken();
  const { candidate, sha } = await loadCandidate();
  await assertProductionDomainsAttached();
  await verifySite(candidate.preview_url, candidate.version_id);
  await verifyAiHealth();
  const previous = await currentVersion();
  const aiRoutePreviouslyAttached = await hasAiRoute();
  // Cloudflare Custom Domains can lag behind an otherwise active gradual
  // deployment. The atomic deploy path creates and activates the same tested
  // build in one operation and updates its triggers as one production change.
  runWrangler(["deploy", "--strict", "--message", `production ${sha.slice(0, 12)}`], { artifact: true });
  const deployedVersion = await currentVersion();
  if (!deployedVersion || deployedVersion === previous) {
    throw new Error("Cloudflare did not activate a new atomic production version.");
  }
  try {
    try {
      await verifySite("https://nexusnxs.com", deployedVersion);
    } catch {
      await refreshProductionTriggers();
      await verifySite("https://nexusnxs.com", deployedVersion, { attempts: 12 });
    }
    await verifyAiHealth(deployedVersion, { attempts: 12 });
  } catch (releaseError) {
    if (!aiRoutePreviouslyAttached) await removeAiRoute();
    if (previous && previous !== deployedVersion) {
      runWrangler(["rollback", previous, "--yes", "--message", `automatic rollback ${sha.slice(0, 12)}`]);
      try {
        await verifySite("https://nexusnxs.com", previous, { attempts: 12 });
      } catch (rollbackError) {
        throw new AggregateError([releaseError, rollbackError], "Production gate and rollback verification both failed.");
      }
    }
    throw releaseError;
  }
  console.log(`Production release complete: ${deployedVersion}`);
}

async function rollback() {
  const versionId = process.argv[3];
  if (!/^[0-9a-f-]{32,36}$/i.test(versionId ?? "")) {
    throw new Error("Usage: npm run release:rollback -- <version-id>");
  }
  await ensureAccountToken();
  await assertProductionDomainsAttached();
  runWrangler(["rollback", versionId, "--yes", "--message", "operator-requested rollback"]);
  await verifySite("https://nexusnxs.com", versionId, { attempts: 3 });
  await verifyAiHealth();
}

async function diagnose() {
  await ensureAccountToken();
  const [routes, domains, activeVersion, apexDns, wwwDns, rulesets] = await Promise.all([
    workerRoutes(),
    workerDomains(),
    currentVersion(),
    cloudflareZoneRequest("/dns_records?name=nexusnxs.com"),
    cloudflareZoneRequest("/dns_records?name=www.nexusnxs.com"),
    cloudflareZoneRequest("/rulesets"),
  ]);
  const relevantRoutes = routes
    .filter((route) => route.pattern?.includes("nexusnxs.com"))
    .map(({ id, pattern, script }) => ({ id, pattern, script }));
  const relevantDomains = domains
    .filter((domain) => domain.hostname?.endsWith("nexusnxs.com"))
    .map(({ id, hostname, service, environment, zone_id: domainZoneId }) => ({
      id,
      hostname,
      service,
      environment,
      zone_id: domainZoneId,
    }));
  const safeDns = [apexDns, wwwDns].flatMap(({ payload }) => (payload.result ?? []).map(({ id, name, type, content, proxied }) => ({ id, name, type, content, proxied })));
  const safeRulesets = (rulesets.payload.result ?? []).map(({ id, name, kind, phase }) => ({ id, name, kind, phase }));
  console.log(JSON.stringify({
    worker: workerName,
    activeVersion,
    routes: relevantRoutes,
    domains: relevantDomains,
    dns: safeDns,
    rulesets: safeRulesets,
    rulesetsStatus: rulesets.response.status,
    rulesetsErrors: rulesets.payload.errors ?? [],
  }, null, 2));
}

async function purge() {
  await ensureAccountToken();
  await purgeProductionCache();
  console.log("NexusNXS production cache purged.");
}

const action = process.argv[2];
if (action === "bootstrap") await bootstrap();
else if (action === "prepare") await prepare();
else if (action === "activate-initial") await activateInitial();
else if (action === "cutover") await cutover();
else if (action === "promote") await promote();
else if (action === "rollback") await rollback();
else if (action === "diagnose") await diagnose();
else if (action === "purge") await purge();
else throw new Error("Use bootstrap, prepare, activate-initial, cutover, promote, rollback, diagnose, or purge.");
