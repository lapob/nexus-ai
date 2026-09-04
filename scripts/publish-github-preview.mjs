/**
 * @file Publish the verified Founder Preview binaries to the existing GitHub release.
 * @description Uses Git Credential Manager in memory. Credentials are never printed or persisted.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = process.env.NEXUS_GITHUB_REPOSITORY || 'lapob/nexus-ai';
const root = resolve(import.meta.dirname, '..');
const sourceCommit = String(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout || '').trim();
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('Revisione sorgente Git non disponibile.');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const androidGradle = await readFile(resolve(root, 'android', 'NexusRemote', 'app', 'build.gradle'), 'utf8');
const androidVersion = androidGradle.match(/versionName\s*(?:=\s*)?["']([^"']+)["']/)?.[1];
if (!androidVersion) throw new Error('Versione Android pubblica non rilevata.');
const tag = process.env.NEXUS_GITHUB_RELEASE_TAG || `v${packageJson.version}-preview.2`;
const assets = [
  { path: resolve(root, 'release', `NexusNXS-${packageJson.version}-Setup.exe`), type: 'application/vnd.microsoft.portable-executable' },
  { path: resolve(root, 'release-android', `NexusNXS-Android-${androidVersion}.apk`), type: 'application/vnd.android.package-archive' },
  { path: resolve(root, 'artifacts', 'founder-preview', 'CHECKSUMS.sha256'), type: 'text/plain; charset=utf-8' },
  { path: resolve(root, 'artifacts', 'founder-preview', 'release-manifest.preview.json'), type: 'application/json' },
];

function githubCredential() {
  const result = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Credenziale GitHub non disponibile in Git Credential Manager.');
  const values = Object.fromEntries(String(result.stdout || '')
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }));
  if (!values.password) throw new Error('Token GitHub assente.');
  return values.password;
}

async function request(url, token, init = {}) {
  const { allowNotFound = false, ...requestInit } = init;
  const response = await fetch(url, {
    ...requestInit,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'NexusNXS-release-publisher',
      ...(requestInit.headers || {}),
    },
  });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`GitHub ${response.status} ${response.statusText}: ${detail}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function inspectAsset(asset) {
  const [buffer, metadata] = await Promise.all([readFile(asset.path), stat(asset.path)]);
  return {
    ...asset,
    buffer,
    name: basename(asset.path),
    size: metadata.size,
    sha256: createHash('sha256').update(buffer).digest('hex').toUpperCase(),
  };
}

const token = githubCredential();
const prepared = await Promise.all(assets.map(inspectAsset));
const apiRoot = `https://api.github.com/repos/${repository}`;
let release = await request(`${apiRoot}/releases/tags/${encodeURIComponent(tag)}`, token, { allowNotFound: true });
if (!release) {
  release = await request(`${apiRoot}/releases`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, target_commitish: sourceCommit, name: `NexusNXS Founder Preview ${packageJson.version}`, prerelease: true, draft: true })
  });
}
const replaceNames = new Set(prepared.map((asset) => asset.name));
const obsoleteAndroid = /^NexusNXS-Android-.*\.apk$/i;

for (const current of release.assets || []) {
  if (replaceNames.has(current.name) || obsoleteAndroid.test(current.name)) {
    await request(`${apiRoot}/releases/assets/${current.id}`, token, { method: 'DELETE' });
  }
}

for (const asset of prepared) {
  const uploadUrl = `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`;
  await request(uploadUrl, token, {
    method: 'POST',
    headers: {
      'Content-Type': asset.type,
      'Content-Length': String(asset.size),
    },
    body: asset.buffer,
  });
  process.stdout.write(`Pubblicato ${asset.name} (${asset.size} byte, SHA-256 ${asset.sha256})\n`);
}

const releaseBody = [
  '## NexusNXS Founder Preview',
  '',
  'Build pubbliche per la prova controllata con amici. I client usano i servizi NexusNXS e non distribuiscono modelli o knowledge private.',
  '',
  `- Windows 11 x64: NexusNXS ${packageJson.version} Preview (non firmata Authenticode)`,
  `- Android 8+: NexusNXS ${androidVersion} Preview (firma Android Debug, non Play Store)`,
  `- Revisione sorgente: \`${sourceCommit.slice(0, 12)}\``,
  '- Impronte complete: `CHECKSUMS.sha256`',
  '- Manifest pubblico: `release-manifest.preview.json`',
  '',
  'Verifica le impronte nel file CHECKSUMS.sha256 allegato a questa stessa release prima dell’installazione.',
  '',
  `_Asset aggiornati il ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' }).format(new Date())}._`,
].join('\n');

await request(`${apiRoot}/releases/${release.id}`, token, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: `NexusNXS Founder Preview ${packageJson.version}`,
    body: releaseBody,
    prerelease: true,
    draft: false,
  }),
});

process.stdout.write(`Release ${tag} aggiornata senza esporre credenziali.\n`);
