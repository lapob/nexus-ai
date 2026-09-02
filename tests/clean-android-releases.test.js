const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { cleanupAndroidReleases } = require('../scripts/clean-android-releases');

test('conserva alias e build Android recenti eliminando gli artefatti storici', (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-release-'));
  const root = path.join(parent, 'release-android');
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const write = (name, age) => {
    const file = path.join(root, name);
    fs.writeFileSync(file, name);
    const timestamp = new Date(Date.now() - age);
    fs.utimesSync(file, timestamp, timestamp);
  };
  write('NexusNXS-Android.apk', 0);
  write('NexusNXS-Control.apk', 0);
  write('NexusNXS-Android-2.0.0.apk', 1_000);
  write('NexusNXS-Android-1.0.0.apk', 2_000);
  write('NexusNXS-Control-2.0.0.apk', 1_000);
  write('Nexus-AI-legacy.apk', 3_000);
  write('note.txt', 0);

  const result = cleanupAndroidReleases({ releaseRoot: root });

  assert.equal(result.removed, 2);
  assert.deepEqual(fs.readdirSync(root).sort(), [
    'NexusNXS-Android-2.0.0.apk', 'NexusNXS-Android.apk',
    'NexusNXS-Control-2.0.0.apk', 'NexusNXS-Control.apk', 'note.txt'
  ]);
});
