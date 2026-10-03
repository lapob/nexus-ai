const assert = require('node:assert/strict');
const test = require('node:test');
const { publicReleaseTarget, assertPublishedReleaseMatches } = require('../src/shared/public-release');

test('public download URLs follow the component version and publisher tag', () => {
  const current = publicReleaseTarget({ version: require('../package.json').version, tag: process.env.NEXUS_GITHUB_RELEASE_TAG });
  const publicUi = require('../src/remote/public-demo');
  assert.equal(publicUi.WINDOWS_DOWNLOAD, current.windowsDownload);
  assert.equal(publicUi.ANDROID_DOWNLOAD, current.androidDownload);
  for (const version of ['0.3.25', '1.2.3']) {
    const target = publicReleaseTarget({ version });
    assert.equal(target.tag, `v${version}-preview.1`);
    assert.equal(target.windowsDownload, `https://github.com/lapob/nexus-ai/releases/download/${target.tag}/NexusNXS-${version}-Setup.exe`);
    assert.equal(target.androidDownload, `https://github.com/lapob/nexus-ai/releases/download/${target.tag}/NexusNXS-Android.apk`);
  }
});

test('public downloads reject mismatched tags and unsafe URL components', () => {
  assert.throws(() => publicReleaseTarget({ version: '0.3.25', tag: 'v0.3.24-preview.1' }));
  assert.throws(() => publicReleaseTarget({ version: '0.3.25/../other' }));
  assert.throws(() => publicReleaseTarget({ version: '0.3.25', repository: 'https://other/path' }));
  assert.equal(publicReleaseTarget({ version: '0.3.25', tag: 'v0.3.25-preview.2' }).tag, 'v0.3.25-preview.2');
});

test('published releases accept an identical retry and reject replacement or missing assets', () => {
  const prepared = [{ name: 'installer.exe', size: 123, sha256: 'A'.repeat(64) }];
  const original = { draft: false, assets: [{ name: 'installer.exe', size: 123, digest: `sha256:${'a'.repeat(64)}` }] };
  assert.equal(assertPublishedReleaseMatches(original, prepared), true);
  for (const changed of [
    { ...original, assets: [] },
    { ...original, assets: [{ ...original.assets[0], size: 124 }] },
    { ...original, assets: [{ ...original.assets[0], digest: `sha256:${'b'.repeat(64)}` }] },
    { ...original, assets: [original.assets[0], original.assets[0]] },
    { ...original, draft: true },
  ]) assert.throws(() => assertPublishedReleaseMatches(changed, prepared));
  assert.equal(original.assets[0].size, 123);
});
