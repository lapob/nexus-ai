/** @module tests/android-content-reader Behavioral checks of the Android-independent provider boundary. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('Android content IO bounds bytes and time, closes cancelled resources and samples previews', (t) => {
  const root = path.resolve(__dirname, '..');
  const candidates = [process.env.JAVA_HOME, path.resolve(root, '..', '.toolchains/jdk')].filter(Boolean);
  const javaHome = candidates.find((directory) => fs.existsSync(path.join(directory, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac')));
  const executable = (name) => javaHome ? path.join(javaHome, 'bin', `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
  if (spawnSync(executable('javac'), ['-version'], { encoding: 'utf8' }).error) { t.skip('JDK unavailable; Android build and provider runtime checks still required'); return; }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-content-reader-'));
  try {
    const compile = spawnSync(executable('javac'), ['-d', temporary, path.join(root, 'android/NexusRemote/app/src/main/java/local/nexus/remote/BoundedContentReader.java'), path.join(__dirname, 'BoundedContentReaderHarness.java')], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(compile.status, 0, compile.stderr || compile.error?.message);
    const run = spawnSync(executable('java'), ['-cp', temporary, 'BoundedContentReaderHarness'], { encoding: 'utf8', timeout: 15_000 });
    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /PASS content bytes/);
  } finally {
    assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}nexus-content-reader-`));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
