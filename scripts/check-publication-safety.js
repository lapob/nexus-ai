/**
 * @module scripts/check-publication-safety
 * @description Fails CI when publishable source contains credentials or maintainer-specific infrastructure.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Candidate files

const root = path.resolve(__dirname, '..');
const output = execFileSync('git', [
  '-c', `safe.directory=${root.replaceAll('\\', '/')}`,
  'ls-files', '--cached', '--others', '--exclude-standard', '-z'
], { cwd: root, encoding: 'utf8' });
const candidates = output.split('\0').filter(Boolean);
const textExtensions = new Set([
  '.cjs', '.css', '.gradle', '.htm', '.html', '.hujson', '.js', '.json', '.jsx',
  '.kt', '.kts', '.md', '.mjs', '.ps1', '.properties', '.toml', '.ts', '.tsx',
  '.txt', '.xml', '.yaml', '.yml'
]);
const alwaysText = new Set(['.env.example', '.gitattributes', '.gitignore']);

// #endregion

// #region 02 — Publication rules

const forbiddenNames = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)(?:credentials?|secrets?|tokens?)(?:\.[^/]+)?$/i,
  /(^|\/)local\.properties$/i,
  /\.(?:jks|keystore|p12|pfx|pem|key)$/i
];
const forbiddenContent = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['automated authorship marker', /\b(?:generated|written|created|prodotto|scritto|creato|generato)\s+(?:by|with|da|con)\s+(?:chatgpt|codex|claude|copilot|an?\s+ai|un['’]?ia)\b/i],
  ['maintainer Windows profile', /C:[\\/]Users[\\/](?!<|example(?:[\\/]|$)|test(?:[\\/]|$)|user(?:name)?(?:[\\/]|$))[^\\/\s"']+/i],
  ['private tailnet hostname', /\b(?![a-z0-9-]+\.example\.ts\.net\b)[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b/i]
];
const failures = [];

// Le knowledge base sono dati operativi del servizio, non artefatti client.
// Questo controllo impedisce che una futura modifica le reinserisca
// accidentalmente nell'installer o nel repository pubblico.
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageFiles = packageJson.build?.files || [];
const packagedKnowledge = [
  ...packageFiles,
  ...(packageJson.build?.extraResources || []).flatMap((entry) => typeof entry === 'string'
    ? [entry]
    : [entry?.from, entry?.to].filter(Boolean))
].some((entry) => /(?:^|[\\/])(?:\.knowledge-private|\.knowledge-public|knowledge-public)(?:[\\/]|$)/i.test(String(entry)));
if (packagedKnowledge) failures.push('package.json: knowledge content must not be shipped in the public client');

// I file locali ignorati da Git restano comunque visibili a electron-builder.
// La configurazione della release deve quindi essere una allowlist, mai un glob
// che possa inglobare endpoint privati, benchmark o proprietà del maintainer.
const broadConfigPatterns = packageFiles.filter((entry) => /^config[\\/](?:\*|\*\*)/i.test(String(entry)));
if (broadConfigPatterns.length) failures.push(`package.json: replace broad config packaging with an allowlist (${broadConfigPatterns.join(', ')})`);
const allowedPackagedConfig = new Set([
  'config/nexus-design-tokens.json',
  'config/nexus-interaction-states.json',
  'config/access-profiles.json',
  'config/portable.json',
  'config/public-client.json',
  'config/public-client.release.json',
  'config/python-runtime.json',
  // Contiene esclusivamente soglie di qualità e URL pubblici; bootstrap e
  // installer devono condividere gli stessi obiettivi verificabili.
  'config/product-slo.json'
]);
for (const entry of packageFiles.map((value) => String(value).replaceAll('\\', '/'))) {
  if (entry.startsWith('config/') && !allowedPackagedConfig.has(entry)) {
    failures.push(`package.json: config file is not approved for the public client (${entry})`);
  }
}

for (const relative of candidates) {
  if (/(?:^|\/)(?:\.knowledge-private|\.knowledge-public)(?:\/|$)/i.test(relative.replaceAll('\\', '/'))) {
    failures.push(`${relative}: knowledge vault must remain outside the public repository`);
  }
}

for (const relative of candidates) {
  const normalized = relative.replaceAll('\\', '/');
  if (forbiddenNames.some((rule) => rule.test(normalized)) && normalized !== '.env.example') {
    failures.push(`${normalized}: forbidden sensitive filename`);
    continue;
  }
  const extension = path.extname(normalized).toLowerCase();
  if (!textExtensions.has(extension) && !alwaysText.has(path.basename(normalized))) continue;
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 4 * 1024 * 1024) continue;
  const content = fs.readFileSync(absolute, 'utf8');
  for (const [label, rule] of forbiddenContent) {
    if (rule.test(content)) failures.push(`${normalized}: ${label}`);
  }
}

// #endregion

// #region 03 — CI result

if (failures.length) {
  console.error(`Publication safety check failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Publication safety verified across ${candidates.length} candidate files.`);
}

// #endregion
