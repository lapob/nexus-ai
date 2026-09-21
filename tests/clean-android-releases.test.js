const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { cleanupAndroidReleases } = require('../scripts/clean-android-releases');

test('anteprima non distruttiva e rollback ordinato per versione, non per data', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-clean-'));
  const root = path.join(parent, 'release-android'); fs.mkdirSync(root);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const names = ['NexusNXS-Android.apk', 'NexusNXS-Android-6.5.9.apk', 'NexusNXS-Android-6.5.16.apk', 'NexusNXS-Android-6.5.17.apk', 'personal.apk', 'note.txt'];
  for (const name of names) fs.writeFileSync(path.join(root, name), 'artifact');
  const future = new Date(Date.now() + 100000); fs.utimesSync(path.join(root, names[1]), future, future);
  const preview = cleanupAndroidReleases({ releaseRoot: root });
  assert.equal(preview.removed, 0);
  assert.deepEqual(preview.planned, [names[1]]);
  assert.equal(fs.readdirSync(root).length, names.length);
  const applied = cleanupAndroidReleases({ releaseRoot: root, dryRun: false });
  assert.equal(applied.removed, 1);
  assert.equal(applied.recoveredBytes, 8);
  assert.ok(fs.existsSync(path.join(root, 'personal.apk')));
  assert.ok(fs.existsSync(path.join(root, names[2])));
  assert.equal(cleanupAndroidReleases({ releaseRoot: root, dryRun: false }).removed, 0);
});
test('rifiuta destinazioni fuori dal formato di release', () => {
  assert.throws(() => cleanupAndroidReleases({ releaseRoot: os.tmpdir() }));
});
