/**
 * @module tests/server-console
 * @description Server Console: task senza finestre, arresto voluto rispettato dal watchdog,
 * comandi solo tramite gestore coordinato e alimentazione del PC solo con conferma scritta.
 * I flussi reali girano con gestore e spegnimento simulati: nessuna azione sul PC.
 */
// #region 01 — Contratto statico
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'scripts', name), 'utf8');
const consoleScript = read('server-console.ps1');
const opener = read('open-server-console.ps1');
const manager = read('manage-headless-server-task.ps1');
const watchdog = read('server-watchdog.ps1');

test('i task nella sessione del proprietario girano senza finestra (conhost --headless)', () => {
  assert.match(manager, /conhost\.exe/);
  assert.match(manager, /--headless "\{0\}" \{1\}/);
  const watchdogInstall = manager.slice(manager.indexOf('function Install-WatchdogTask'), manager.indexOf('function Install-ServerTask'));
  assert.match(watchdogInstall, /New-OwnerSessionTaskAction/);
  const bridgeInstall = manager.slice(manager.indexOf('function Install-DesktopBridgeTask'), manager.indexOf('function Install-ConsoleTask'));
  assert.match(bridgeInstall, /New-OwnerSessionTaskAction/);
  assert.match(manager, /'install-bridge', 'install-console'/);
});

test('la console si apre all accesso, una sola istanza, e si rimuove con il server', () => {
  assert.match(manager, /\$consoleTaskName = 'NexusNXS Console'/);
  assert.match(manager, /Install-WatchdogTask\s+Install-ConsoleTask/);
  assert.match(manager, /Unregister-ScheduledTask -TaskName \$consoleTaskName/);
  assert.match(opener, /TryOpenExisting\('Local\\NexusNXS\.ServerConsole'/);
  assert.match(consoleScript, /Mutex\]::new\(\$false, 'Local\\NexusNXS\.ServerConsole'/);
  assert.match(opener, /NEXUS_DESKTOP_BRIDGE_ONLY/, 'le variabili del bridge non devono passare alla console');
  // All'accesso parte ridotta a icona senza rubare il focus; dal menu Start (-Normal) torna davanti.
  assert.match(opener, /ShowWindow\(\$handle, 7\)/);
  assert.match(opener, /TotalMilliseconds -ge 1500/);
  assert.match(opener, /if \(\$Normal\) \{[\s\S]*?ShowWindow\(\$handle, 9\)/);
  assert.match(manager, /open-server-console\.ps1|\$opener[\s\S]*?-Normal' -f \$pwshPath, \$opener/);
});

test('grafica: frazioni senza arrotondamenti interi, quadro fermo e sincronizzato', () => {
  // [Math]::Max(0, 0.55) in PowerShell sceglie Max(int, int): barre sempre piene e sfumature a due toni.
  assert.doesNotMatch(consoleScript, /\[Math\]::(Max|Min)\((0|1), (\$Amount|\$Fraction|\$percent|\[double\]|\[Math\])/);
  assert.match(consoleScript, /\[Math\]::Min\(1\.0, \[Math\]::Max\(0\.0, \$Fraction\)\)/);
  assert.match(consoleScript, /`e\[\?2026h/, 'aggiornamento sincronizzato del terminale');
  assert.doesNotMatch(consoleScript, /Format-Rule/, 'nessun riflesso che scorre sul pannello');
  assert.match(consoleScript, /Schedule\.Service/, 'stato dei task via COM, non con i cmdlet lenti');
  assert.match(opener, /'-Color'/);
});

test('arresto voluto: il gestore lo segna, il watchdog lo rispetta fino al riavvio del PC', () => {
  assert.match(manager, /server-stopped\.flag/);
  assert.match(manager, /if \(\$Action -eq 'stop'\) \{[\s\S]*?WriteAllText\(\$ownerStopFlag/);
  assert.match(watchdog, /server-stopped\.flag/);
  assert.match(watchdog, /LastBootUpTime/);
  assert.match(watchdog, /LastWriteTime -gt \$bootTime/);
});

test('la console agisce solo tramite il gestore e chiede la parola per spegnere', () => {
  assert.match(consoleScript, /-File \$ManagerPath -Action \$ManagerAction/);
  assert.doesNotMatch(consoleScript, /Stop-Process|taskkill|Stop-Computer|Restart-Computer/i);
  assert.match(consoleScript, /\[string\]\$typed -cne \$word/);
  assert.match(consoleScript, /if \(-not \(Invoke-Manager 'stop'\)\)/, 'il PC non si spegne se il server non si è fermato');
  assert.match(consoleScript, /\/t 60/);
});
// #endregion

// #region 02 — Flussi simulati
const pwsh = process.platform === 'win32'
  ? spawnSync('pwsh.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' })
  : { status: 1 };
const skip = pwsh.status !== 0 ? 'PowerShell 7 non disponibile' : false;

function runConsole(keys) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-console-'));
  const calls = path.join(dir, 'calls.txt');
  const record = (label) => `[IO.File]::AppendAllText('${calls.replace(/'/g, "''")}', "${label}\`n")\nexit 0\n`;
  fs.writeFileSync(path.join(dir, 'manager.ps1'), `param([string]$Action)\n${record('manager $Action')}`);
  fs.writeFileSync(path.join(dir, 'power.ps1'), record('power $($args -join \' \')'));
  const result = spawnSync('pwsh.exe', [
    '-NoProfile', '-File', path.join(root, 'scripts', 'server-console.ps1'),
    '-NoColor', '-Offline', '-DataRoot', path.join(dir, 'data'),
    '-PrivatePort', '39991', '-PublicPort', '39992',
    '-ManagerPath', path.join(dir, 'manager.ps1'), '-PowerExecutable', path.join(dir, 'power.ps1'),
    '-ScriptedInput', keys.join(',')
  ], { encoding: 'utf8', timeout: 90000 });
  const recorded = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split(/\r?\n/).filter(Boolean) : [];
  return { dir, result, recorded };
}

test('fotogramma: stato, sezioni e tasti', { skip }, () => {
  const { result, recorded } = runConsole([]);
  assert.equal(result.status, 0, result.stderr);
  for (const label of ['NON ATTIVO', 'SERVIZIO', 'MOTORE AI', 'SORVEGLIANZA', 'RETE', 'DATI', 'EVENTI RECENTI', 'spegni PC']) {
    assert.ok(result.stdout.includes(label), `manca ${label}`);
  }
  assert.deepEqual(recorded, []);
});

test('spegnimento: parola esatta, arresto pulito, poi annullabile con ripartenza del server', { skip }, () => {
  const { result, recorded } = runConsole(['p', '1', 'text:SPEGNI', 'x']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(recorded, [
    'manager stop',
    'power /s /t 60 /d p:0:0 /c NexusNXS: richiesto dalla Server Console.',
    'power /a',
    'manager start'
  ]);
});

test('parola sbagliata o minuscola: nessuna azione', { skip }, () => {
  const { recorded } = runConsole(['p', '1', 'text:spegni']);
  assert.deepEqual(recorded, []);
  const restart = runConsole(['p', '2', 'text:SPEGNI']);
  assert.deepEqual(restart.recorded, []);
});

test('manutenzione crea il flag; il riavvio chiede conferma', { skip }, () => {
  const maintenance = runConsole(['m']);
  assert.ok(fs.existsSync(path.join(maintenance.dir, 'data', 'maintenance.flag')));
  assert.deepEqual(runConsole(['r', 'n']).recorded, []);
  assert.deepEqual(runConsole(['r', 's']).recorded, ['manager restart']);
});
// #endregion
