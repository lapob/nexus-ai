const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('il controllo ADB conserva output validi e arresta la verifica su exit non zero', () => {
  const helper = path.resolve(__dirname, '../scripts/lib/checked-adb.ps1').replace(/'/g, "''");
  const executable = process.execPath.replace(/'/g, "''");
  const run = (code) => spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference = 'Stop'; . '${helper}'; $adb = '${executable}'; Invoke-CheckedAdb -e '${code}'; Write-Output 'VERIFIED'`
  ], { encoding: 'utf8', windowsHide: true });
  const success = run('console.log(42)');
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /42/);
  assert.match(success.stdout, /VERIFIED/);
  const failure = run('process.exit(7)');
  assert.notEqual(failure.status, 0);
  assert.doesNotMatch(failure.stdout, /VERIFIED/);
  assert.match(failure.stderr, /exit 7/);
});
