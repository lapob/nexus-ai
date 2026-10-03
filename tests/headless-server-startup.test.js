const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manager = path.join(root, 'scripts/manage-headless-server-task.ps1');
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const windows = process.platform === 'win32';
function run(script) {
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', timeout: 20000, windowsHide: true
  });
  assert.ifError(result.error);
  return result;
}
function functions(names, file = manager) {
  return `$ast=[Management.Automation.Language.Parser]::ParseFile(${quote(file)},[ref]$null,[ref]$null);
    foreach($name in @(${names.map(quote).join(',')})) {
      $definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true);
      if(-not $definition){throw "Missing function $name"}; Invoke-Expression $definition.Extent.Text
    }`;
}

test('connection gate rejects absent private access, missing ports and network listeners', { skip: !windows }, () => {
  const result = run(`${functions(['Test-AuditReady'], path.join(root, 'scripts/audit-connections.ps1'))}
    $report=@{Public=@(@{Status=200});LocalGateway=@{Status=200};Tailscale=@{Installed=$true;State='Running'};
      Listeners=@(@{Port=32145;Exposure='localhost'},@{Port=32147;Exposure='localhost'})};
    $values=@(); $values+=Test-AuditReady $report;
    $report.Tailscale.Installed=$false; $values+=Test-AuditReady $report;
    $report.Tailscale.Installed=$true; $report.Tailscale.State='Stopped'; $values+=Test-AuditReady $report;
    $report.Tailscale.State='Running'; $report.Listeners=$report.Listeners[0]; $values+=Test-AuditReady $report;
    $report.Listeners=@(@{Port=32145;Exposure='localhost'},@{Port=32147;Exposure='network'}); $values+=Test-AuditReady $report;
    $report.Listeners[1].Exposure='localhost'; $report.Public=@(); $values+=Test-AuditReady $report;
    $values|ConvertTo-Json -Compress`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [true, false, false, false, false, false]);
});

test('portable boot waits for its own SSD and propagates a failing runner exit', { skip: !windows }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-boot-'));
  try {
    const entry = path.join(fixture, 'runner.ps1');
    fs.writeFileSync(entry, 'exit 7');
    const encoded = run(`${functions(['Get-PortableTaskArguments'])}
      $projectRoot=${quote(fixture)}; $nodePath=${quote(process.execPath)};
      function Get-Volume {param($DriveLetter) [pscustomobject]@{UniqueId='owned-ssd';DriveLetter=${quote(path.parse(fixture).root[0])}}}
      Get-PortableTaskArguments -EntryPoint ${quote(entry)}`).stdout.trim().split(' ').at(-1);
    const command = Buffer.from(encoded, 'base64').toString('utf16le');
    const drive = path.parse(fixture).root[0];
    const delayed = run(`$script:attempts=0;
      function Get-Volume { $script:attempts++; if($script:attempts -ge 3){[pscustomobject]@{UniqueId='owned-ssd';DriveLetter='${drive}'}} }
      function Start-Sleep {}
      ${command}`);
    assert.equal(delayed.status, 7, delayed.stderr);
    const absent = run(`function Get-Volume { [pscustomobject]@{UniqueId='different-ssd';DriveLetter='${drive}'} }
      function Start-Sleep {}
      ${command.replace('AddSeconds(120)', 'AddSeconds(0)')}`);
    assert.equal(absent.status, 20, absent.stderr);
    fs.unlinkSync(entry);
    const missing = run(`function Get-Volume { [pscustomobject]@{UniqueId='owned-ssd';DriveLetter='${drive}'} }
      function Start-Sleep {}
      ${command.replace('AddSeconds(120)', 'AddSeconds(0)')}`);
    assert.equal(missing.status, 21, missing.stderr);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test('bootstrap logging preserves bracket paths and native exit status', { skip: !windows }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-log-'));
  try {
    const data = path.join(fixture, '[portable]');
    const launcher = path.join(fixture, 'launcher.js');
    fs.writeFileSync(launcher, "console.log('started');console.error('bootstrap-failure');process.exit(9)");
    const source = fs.readFileSync(path.join(root, 'scripts/run-headless-server.ps1'), 'utf8');
    const logging = source.slice(source.indexOf('$launcherLogDirectory ='));
    const result = run(`$ErrorActionPreference='Stop';$dataRoot=${quote(data)};$node=${quote(process.execPath)};$launcher=${quote(launcher)};${logging}`);
    assert.equal(result.status, 9, result.stderr);
    const log = fs.readFileSync(path.join(data, 'logs/headless-launcher.log'), 'utf8');
    assert.match(log, /started/);
    assert.match(log, /bootstrap-failure/);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

for (const mode of ['Boot', 'Logon']) {
  test(`${mode} task uses owner identity, limited privileges and preserves tasks on registration failure`, { skip: !windows }, () => {
    for (const fail of [true, false]) {
      const result = run(`${functions(['Install-ServerTask'])}
        $ErrorActionPreference='Stop'; $StartupMode='${mode}'; $projectRoot='C:\\fixture';
        $taskName='Server'; $legacyTaskName='Legacy'; $deviceCoreTaskName='Connectivity'; $presenceTaskName='Presence'; $desktopBridgeTaskName='Bridge';
        $pwshPath='pwsh.exe'; $runnerPath='runner.ps1'; $script:events=@(); $script:registrations=@();
        function Get-PortableTaskArguments { '-EncodedCommand fixture' }
        function New-ScheduledTaskAction {param($Execute,$Argument,$WorkingDirectory) @{Execute=$Execute}}
        function New-ScheduledTaskTrigger {param([switch]$AtStartup,[switch]$AtLogOn,$User) $script:trigger=if($AtStartup){'Boot'}else{'Logon'}; @{} }
        function New-ScheduledTaskPrincipal {param($UserId,$LogonType,$RunLevel) $script:principal=@{User=$UserId;Logon=$LogonType;Level=$RunLevel}; @{} }
        function New-ScheduledTaskSettingsSet {param([switch]$StartWhenAvailable,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,$RestartCount,$RestartInterval,$ExecutionTimeLimit,$MultipleInstances) @{} }
        function Register-ScheduledTask { $script:events+='register'; $script:registrations+=@{trigger=$script:trigger;principal=$script:principal}; ${fail ? "throw 'access denied'" : ''} }
        function Unregister-ScheduledTask { $script:events+='remove' }
        function Stop-PresenceProcess { $script:events+='stop' }
        try { Install-ServerTask | Out-Null } catch { $script:failure=$_.Exception.Message }
        @{events=@($script:events);trigger=$script:registrations[0].trigger;principal=$script:registrations[0].principal;registrations=@($script:registrations);failure=$script:failure}|ConvertTo-Json -Depth 5 -Compress`);
      assert.equal(result.status, 0, result.stderr);
      const data = JSON.parse(result.stdout);
      assert.equal(data.trigger, mode);
      assert.equal(data.principal.Level, 'Limited');
      assert.match(data.principal.User, /^S-1-/);
      assert.equal(data.principal.Logon, mode === 'Boot' ? 'S4U' : 'Interactive');
      if (fail) assert.deepEqual(data.events, ['register']);
      else if (mode === 'Boot') {
        assert.deepEqual(data.events, ['register', 'register', 'remove', 'stop', 'remove', 'remove']);
        assert.equal(data.registrations[1].trigger, 'Logon');
        assert.equal(data.registrations[1].principal.Logon, 'Interactive');
        assert.equal(data.registrations[1].principal.Level, 'Limited');
      } else assert.deepEqual(data.events, ['register', 'remove', 'stop', 'remove', 'remove', 'remove']);
    }
  });
}
