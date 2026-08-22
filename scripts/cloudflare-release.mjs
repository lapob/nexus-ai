import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const statePath = resolve(root, ".wrangler", "release-candidate.json");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const git = process.platform === "win32" ? "git.exe" : "git";

function run(command, args, { capture = false, allowFailure = false, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", ...env },
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

function assertCleanSource() {
  if (output(git, ["status", "--porcelain"])) {
    throw new Error("Commit or intentionally discard every source change before releasing.");
  }
}

function verifyRelease() {
  run(npm, ["ci", "--ignore-scripts"]);
  run(npm, ["run", "verify:release"]);
}

function wranglerArgs(...args) {
  return ["wrangler", ...args, "--config", "dist/server/wrangler.json"];
}

async function parseUploadEvent(pathname) {
  const lines = (await readFile(pathname, "utf8")).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => JSON.parse(line)).findLast((event) => event.type === "version-upload");
}

async function currentVersion() {
  const deployments = JSON.parse(output(npx, wranglerArgs("deployments", "list", "--json")));
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
  verifyRelease();
  const existing = run(npx, wranglerArgs("versions", "list", "--json"), { capture: true, allowFailure: true });
  if (existing.status === 0 && JSON.parse(existing.stdout).length > 0) {
    throw new Error("nexusnxs-site already exists; bootstrap is intentionally one-time only.");
  }
  const sha = output(git, ["rev-parse", "--short=12", "HEAD"]);
  run(npx, wranglerArgs("deploy", "--strict", "--message", `bootstrap ${sha}`));
  console.log("Worker bootstrap complete. Upload a tested candidate before attaching domains.");
}

async function prepare() {
  assertCleanSource();
  verifyRelease();
  const sha = output(git, ["rev-parse", "HEAD"]);
  const shortSha = sha.slice(0, 12);
  const outputPath = resolve(root, ".wrangler", `version-upload-${shortSha}.ndjson`);
  await mkdir(dirname(outputPath), { recursive: true });
  run(npx, wranglerArgs(
    "versions", "upload",
    "--strict",
    "--preview-alias", "candidate",
    "--tag", `site-${shortSha}`,
    "--message", `candidate ${shortSha}`,
  ), { env: { WRANGLER_OUTPUT_FILE_PATH: outputPath } });
  const event = await parseUploadEvent(outputPath);
  const previewUrl = event?.preview_alias_url ?? event?.preview_url;
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

async function promote() {
  assertCleanSource();
  const candidate = JSON.parse(await readFile(statePath, "utf8"));
  const sha = output(git, ["rev-parse", "HEAD"]);
  if (candidate.source_commit !== sha) throw new Error("Candidate and current Git commit differ; prepare a new candidate.");
  run(process.execPath, ["scripts/verify-deployment.mjs", candidate.preview_url]);
  const previous = await currentVersion();
  run(npx, wranglerArgs(
    "versions", "deploy", `${candidate.version_id}@100%`,
    "--yes", "--message", `production ${sha.slice(0, 12)}`,
  ));
  try {
    run(process.execPath, ["scripts/verify-deployment.mjs", "https://nexusnxs.com"]);
  } catch (error) {
    if (previous && previous !== candidate.version_id) {
      run(npx, wranglerArgs("rollback", previous, "--yes", "--message", `automatic rollback ${sha.slice(0, 12)}`));
    }
    throw error;
  }
  console.log(`Production release complete: ${candidate.version_id}`);
}

async function rollback() {
  const versionId = process.argv[3];
  if (!/^[0-9a-f-]{32,36}$/i.test(versionId ?? "")) {
    throw new Error("Usage: npm run release:rollback -- <version-id>");
  }
  run(npx, wranglerArgs("rollback", versionId, "--yes", "--message", "operator-requested rollback"));
  run(process.execPath, ["scripts/verify-deployment.mjs", "https://nexusnxs.com"]);
}

const action = process.argv[2];
if (action === "bootstrap") await bootstrap();
else if (action === "prepare") await prepare();
else if (action === "promote") await promote();
else if (action === "rollback") await rollback();
else throw new Error("Use bootstrap, prepare, promote, or rollback.");
