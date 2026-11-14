/**
 * @module tests/server-watchdog
 * @description Il sorvegliante del server resta prudente: soglie, limite di riavvii, pausa in manutenzione.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const watchdog = fs.readFileSync(path.join(root, 'scripts', 'server-watchdog.ps1'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'scripts', 'manage-headless-server-task.ps1'), 'utf8');

test('riavvio solo dopo 3 controlli falliti, con server avviato da almeno 10 minuti e massimo 2 l\'ora', () => {
  assert.match(watchdog, /\$state\.failures -ge 3 -and \$ageMinutes -ge 10/);
  assert.match(watchdog, /\$state\.restarts\.Count -ge 2/);
  assert.match(watchdog, /AddHours\(-1\)/);
  assert.match(watchdog, /-Action restart/, 'il riavvio passa dal gestore coordinato, mai da un kill diretto');
  assert.doesNotMatch(watchdog, /Stop-Process|taskkill/i);
});

test('pausa in manutenzione e con un gestore già attivo; DryRun non scrive né riavvia', () => {
  assert.match(watchdog, /maintenance\.flag/);
  assert.match(watchdog, /TotalHours -lt 2/);
  assert.match(watchdog, /manage-headless-server-task\.ps1/);
  assert.match(watchdog, /if \(\$DryRun\) \{ Write-Output/);
  assert.match(watchdog, /if \(-not \$DryRun\) \{\s*& \(Get-Command pwsh\.exe\)/);
});

test('il gestore installa e rimuove il sorvegliante insieme al server', () => {
  assert.match(manager, /'install-watchdog'/);
  assert.match(manager, /Install-WatchdogTask\s+Install-ConsoleTask\s+Write-Output "NexusNXS Server autostart installed/);
  assert.match(manager, /Unregister-ScheduledTask -TaskName \$watchdogTaskName/);
  assert.match(manager, /-RepetitionInterval \(New-TimeSpan -Minutes 2\)/);
});
