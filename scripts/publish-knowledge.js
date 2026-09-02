/**
 * @module scripts/publish-knowledge
 * @description Impacchetta la vault pubblica curata senza derivarla dalla knowledge privata.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// #region 01 — Confini e policy

const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '..', '.knowledge-public');
const pack = path.join(root, 'knowledge-packs', 'core');
const staging = path.join(root, 'developer-artifacts', 'knowledge-public-staging');
const excludedPrefixes = ['.nexus/', '.obsidian/', 'tools/'];
const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/i,
  /C:\\Users\\[^\\\s]+/i,
  /[A-Z]:\\(?:\[AI\]|\[BRAIN\])/i
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function copySafe(relative, targetRoot) {
  if (excludedPrefixes.some((prefix) => relative.startsWith(prefix))) return false;
  const from = path.join(source, relative);
  if (path.extname(from).toLowerCase() === '.md') {
    const text = fs.readFileSync(from, 'utf8');
    const violation = secretPatterns.find((pattern) => pattern.test(text));
    if (violation) throw new Error(`Contenuto non pubblicabile rilevato in ${relative}`);
    const to = path.join(targetRoot, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, text, 'utf8');
    return true;
  }
  const to = path.join(targetRoot, relative);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

// #endregion

// #region 02 — Pubblicazione atomica e pack

if (!fs.existsSync(source)) throw new Error(`Knowledge pubblica autorevole assente: ${source}`);
const governance = spawnSync(process.execPath, [path.join(root, 'scripts', 'audit-knowledge-governance.js'), '--strict'], { stdio: 'inherit' });
if (governance.status !== 0) process.exit(governance.status || 1);
const normalize = spawnSync(process.execPath, [path.join(root, 'scripts', 'normalize-public-knowledge.js')], { stdio: 'inherit' });
if (normalize.status !== 0) process.exit(normalize.status || 1);
const benchmark = spawnSync(process.execPath, [
  path.join(root, 'scripts', 'benchmark-private-knowledge.js'),
  `--vault=${source}`,
  '--min-pass-rate=80',
  '--min-mrr=0.65',
  '--min-citation-coverage=90',
], { stdio: 'inherit' });
if (benchmark.status !== 0) process.exit(benchmark.status || 1);
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
let copied = 0;
for (const file of walk(source)) {
  const relative = path.relative(source, file).replaceAll('\\', '/');
  if (copySafe(relative, staging)) copied += 1;
}
const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-knowledge-catalog.js'), `--vault=${staging}`], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
fs.rmSync(pack, { recursive: true, force: true });
fs.mkdirSync(pack, { recursive: true });
fs.cpSync(staging, pack, { recursive: true, force: true });
fs.rmSync(staging, { recursive: true, force: true });
process.stdout.write(`Knowledge pack pubblico aggiornato: ${copied} file curati e verificati.\n`);

// #endregion
