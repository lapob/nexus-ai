/**
 * @module tests/cleanup-workstation
 * @description Prove reali dei confini della pulizia PowerShell su un progetto sintetico.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// #region Fixture e casi distruttivi isolati

test('cleanup pianifica senza cancellare e rifiuta junction esterne', { skip: process.platform !== 'win32' }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cleanup-'));
  const root = path.join(temporary, 'NexusNXS', '.AI');
  const scripts = path.join(root, 'scripts');
  const candidate = path.join(root, 'qa-artifacts', 'ollama-candidate');
  const outside = path.join(temporary, 'outside');
  const link = path.join(root, 'android', 'NexusRemote', 'app', 'build');
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(candidate, { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'private');
  fs.writeFileSync(path.join(candidate, 'windows.zip'), 'regenerable');
  fs.copyFileSync(path.resolve(__dirname, '../scripts/cleanup-workstation.ps1'), path.join(scripts, 'cleanup-workstation.ps1'));
  const run = (...args) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(scripts, 'cleanup-workstation.ps1'), ...args], { encoding: 'utf8', windowsHide: true });
  try {
    const planned = run();
    assert.equal(planned.status, 0, planned.stderr);
    assert.equal(fs.existsSync(path.join(candidate, 'windows.zip')), true);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(outside, link, 'junction');
    const rejected = run();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Collegamento escluso/);
    assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'private');
    fs.unlinkSync(link);
    const applied = run('-Apply');
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(fs.existsSync(path.join(candidate, 'windows.zip')), false);
    assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'private');
    const report = JSON.parse(fs.readFileSync(path.join(root, 'qa-artifacts', 'cleanup-latest.json'), 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(report.RecoveredBytes, 11);
  } finally {
    if (fs.existsSync(link)) fs.unlinkSync(link);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

// #endregion
