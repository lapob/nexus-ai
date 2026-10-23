const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateManifest, render } = require('../scripts/generate-android-symbols');
const root = path.resolve(__dirname, '..');
const manifest = require('../config/android-symbols.json');

test('both Android icon consumers are generated from the pinned offline symbol catalog', () => {
  assert.doesNotThrow(() => validateManifest(manifest));
  for (const [file, content] of render(manifest)) assert.equal(fs.readFileSync(file, 'utf8'), content);
  const source = fs.readFileSync(path.join(root, 'android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt'), 'utf8');
  for (const [, name] of source.matchAll(/NexusSymbols\.([A-Za-z]+)/g)) assert.ok(manifest.icons[name], `Unknown symbol ${name}`);
  assert.doesNotMatch(source, /androidx\.compose\.material\.icons/);
  const control = fs.readFileSync(path.join(root, 'android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java'), 'utf8');
  const mapping = control.split('private String symbolName(String value) {')[1].split('@Override public void draw')[0];
  for (const [, name] of mapping.matchAll(/return "([A-Za-z]+)"/g)) assert.ok(manifest.icons[name], `Unknown Control symbol ${name}`);
});

test('tampered symbol paths, unpinned origins and invalid vector syntax fail offline verification', () => {
  for (const mutate of [m => { m.revision = 'master'; }, m => { m.source = 'https://evil.invalid'; },
    m => { m.icons.Settings.path += 'M0 0'; }, m => { m.icons.Settings.path = '<script/>'; }]) {
    const value = structuredClone(manifest); mutate(value); assert.throws(() => validateManifest(value));
  }
});
