/** @module tests/installer-artifacts Reject incomplete or stale release artifacts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyInstallerArtifacts } = require('../scripts/lib/installer-artifacts');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-installer-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const version = '0.3.18';
  const files = ['release/win-unpacked/resources/app.asar', `release/NexusNXS-${version}-Setup.exe`,
    `release/NexusNXS-${version}-Setup.exe.blockmap`, 'release/latest.yml'];
  const source = ['config/public-client.release.json', 'src/application/bootstrap.js',
    'src/application/register-ipc.js', 'src/infrastructure/windows/continuity-task.js'];
  const archive = new Map([['package.json', Buffer.from(JSON.stringify({ version }))]]);
  for (const relative of [...files, ...source]) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `fixture ${relative}`);
    if (source.includes(relative)) archive.set(relative, fs.readFileSync(absolute));
  }
  return { root, version, files, source, archive, extractFile: (_archive, relative) => archive.get(relative.replaceAll('\\', '/')) };
}

test('il gate richiede una build completa della revisione corrente', t => {
  const state = fixture(t);
  assert.ok(verifyInstallerArtifacts(state).installer.endsWith('0.3.18-Setup.exe'));
});
for (const index of [0, 1, 2, 3]) {
  test(`artefatto ${index} assente o vuoto impedisce la distribuzione`, t => {
    const state = fixture(t), file = path.join(state.root, state.files[index]);
    fs.unlinkSync(file);
    assert.throws(() => verifyInstallerArtifacts(state), /mancante o vuoto/);
    fs.writeFileSync(file, '');
    assert.throws(() => verifyInstallerArtifacts(state), /mancante o vuoto/);
  });
}
test('un ASAR della versione precedente non passa con il nuovo installer', t => {
  const state = fixture(t);
  state.archive.set('package.json', Buffer.from('{"version":"0.3.14"}'));
  assert.throws(() => verifyInstallerArtifacts(state), /Versione ASAR/);
});
for (const relative of ['config/public-client.release.json', 'src/infrastructure/windows/continuity-task.js']) {
  test(`rifiuta una copia obsoleta di ${relative} anche con la versione corretta`, t => {
    const state = fixture(t);
    state.archive.set(relative, Buffer.from('previous build'));
    assert.throws(() => verifyInstallerArtifacts(state), /ASAR non aggiornato/);
  });
}
