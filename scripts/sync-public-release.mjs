import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const tag = process.argv.find(value => value.startsWith('--tag='))?.slice(6);
assert.match(tag || '', /^v\d+\.\d+\.\d+-preview\.\d+$/);
const repository = 'lapob/nexus-ai';
const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, { signal: AbortSignal.timeout(20000) });
assert.equal(response.ok, true, 'Release pubblica non raggiungibile');
const release = await response.json();
assert.equal(release.draft, false);
const base = `https://github.com/${repository}/releases/download/${tag}/`;
const manifestResponse = await fetch(`${base}release-manifest.preview.json`, { signal: AbortSignal.timeout(20000) });
assert.equal(manifestResponse.ok, true, 'Distinta pubblica non raggiungibile');
const manifest = await manifestResponse.json();
assert.equal(manifest.visibility, 'public');
assert.equal(manifest.containsPrivateArtifacts, false);
assert.equal(manifest.channel, 'preview');
const data = { tag, date: new Date(manifest.generatedAt).toISOString().slice(0, 10) };
for (const [platform, kind] of [['windows', 'installer'], ['android', 'apk']]) {
  const artifact = manifest.artifacts.find(item => item.platform === platform && item.kind === kind);
  assert.ok(artifact && artifact.visibility === 'public');
  assert.match(artifact.sha256, /^[A-Fa-f0-9]{64}$/);
  assert.match(artifact.componentVersion, /^\d+\.\d+\.\d+$/);
  const asset = release.assets.find(item => item.name === artifact.name);
  assert.ok(asset, `File ${platform} mancante`);
  assert.equal(asset.size, artifact.bytes);
  assert.equal(asset.digest?.toLowerCase(), `sha256:${artifact.sha256.toLowerCase()}`);
  assert.equal(asset.browser_download_url, base + artifact.name);
  data[platform] = { version: artifact.componentVersion, bytes: artifact.bytes, sha256: artifact.sha256.toUpperCase(), url: asset.browser_download_url };
}
const directory = new URL('../app/data/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('public-release.json', directory), JSON.stringify(data, null, 2) + '\n');
console.log(`Metadati verificati: Windows ${data.windows.version}, Android ${data.android.version}.`);
