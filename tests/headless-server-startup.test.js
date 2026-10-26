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
const developmentPaths = path.join(root, 'scripts/lib/development-paths.ps1');
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

test('optional services wait for real Core readiness and never outlive their owner', { skip: !windows }, () => {
  const result = run(`${functions(['Wait-NexusCoreReady'], developmentPaths)}
    $script:probes=0;$script:gone=$false;$script:stamp=123L;
    function Get-Process {param($Id,$ErrorAction) if($script:gone){throw 'exited'}; @{StartTime=@{Ticks=$script:stamp};HasExited=$false}}
    function Invoke-RestMethod {param($Uri,$TimeoutSec,[switch]$NoProxy,$MaximumRedirection)
      if($Uri -ne 'http://127.0.0.1:32147/readyz' -or -not $NoProxy -or $MaximumRedirection -ne 0){throw 'Unexpected probe'}
      $script:probes++;if($script:probes -eq 1){throw '503'}; @{status='ready'}
    }
    function Start-Sleep {}
    $ready=Wait-NexusCoreReady -TimeoutSeconds 1 -OwnerProcessId 42 -OwnerStartTicks 123;
    $script:gone=$true;$gone=Wait-NexusCoreReady -TimeoutSeconds 1 -OwnerProcessId 42 -OwnerStartTicks 123;
    $script:gone=$false;$script:stamp=456L;$reused=Wait-NexusCoreReady -TimeoutSeconds 1 -OwnerProcessId 42 -OwnerStartTicks 123;
    @{ready=$ready;gone=$gone;reused=$reused;probes=$script:probes}|ConvertTo-Json -Compress`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ready: true, gone: false, reused: false, probes: 2 });
});

test('accessory readiness timeout never starts an unready service', { skip: !windows }, () => {
  const result = run(`${functions(['Wait-NexusCoreReady'], developmentPaths)}
    function Get-Process {param($Id,$ErrorAction) @{StartTime=@{Ticks=123L};HasExited=$false}}
    function Invoke-RestMethod { @{status='warming'} }
    function Start-Sleep {}
    Wait-NexusCoreReady -TimeoutSeconds 0 -OwnerProcessId 42 -OwnerStartTicks 123`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'False');
});

test('scanner cache selection preserves explicit overrides and falls back without relaxing audit', { skip: !windows }, t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-scanner-location-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  for (const directory of ['tools/cache/grype', 'data/runtime', 'fast-cache']) fs.mkdirSync(path.join(temporary, directory), { recursive: true });
  fs.writeFileSync(path.join(temporary, 'data/runtime/scanner-cache.json'), JSON.stringify({ schemaVersion: 1, cacheDirectory: path.join(temporary, 'fast-cache') }));
  const result = run(`${functions(['Resolve-NexusConfiguredPath', 'Initialize-NexusScannerEnvironment'], developmentPaths)}
    $layout=@{ToolchainsRoot=${quote(path.join(temporary, 'tools'))};DataRoot=${quote(path.join(temporary, 'data'))}};
    $env:GRYPE_DB_CACHE_DIR=$null;Initialize-NexusScannerEnvironment $layout;$selected=$env:GRYPE_DB_CACHE_DIR;
    $env:GRYPE_DB_CACHE_DIR='explicit-cache';Initialize-NexusScannerEnvironment $layout;$explicit=$env:GRYPE_DB_CACHE_DIR;
    $env:GRYPE_DB_CACHE_DIR=$null;
    [IO.File]::WriteAllText((Join-Path $layout.DataRoot 'runtime/scanner-cache.json'),'{bad');
    Initialize-NexusScannerEnvironment $layout 3>$null;
    @{selected=$selected;explicit=$explicit;fallback=$env:GRYPE_DB_CACHE_DIR}|ConvertTo-Json -Compress`);
  assert.equal(result.status, 0, result.stderr);
  const values = JSON.parse(result.stdout);
  assert.equal(values.selected, path.join(temporary, 'fast-cache'));
  assert.equal(values.explicit, 'explicit-cache');
  assert.equal(values.fallback, path.join(temporary, 'tools/cache/grype'));
  const helper = fs.readFileSync(developmentPaths, 'utf8');
  assert.doesNotMatch(helper, /GRYPE_DB_(?:AUTO_UPDATE|VALIDATE_BY_HASH_ON_START|VALIDATE_AGE)\s*=/);
});

test('startup progress separates missing ports, warming and readiness without changing the boolean gate', { skip: !windows }, () => {
  const result = run(`${functions(['Wait-ForGateway'])}
    $gatewayPorts=@(32145,32147);$script:step=0;$script:reports=@();
    function Write-Host {param($Object) $script:reports += [string]$Object}
    function Start-Sleep {}
    function Get-NetTCPConnection {param($State,$ErrorAction)
      $script:step++; [pscustomobject]@{LocalPort=32145};
      if($script:step -ge 2){[pscustomobject]@{LocalPort=32147}}
    }
    function Get-GatewayReadiness {param($Port) if($script:step -lt 3){'warming'}else{'ready'}}
    $ready=Wait-ForGateway $true 3 -ReportProgress;
    function Get-GatewayReadiness {param($Port) if($Port -eq 32145){'ready'}else{'warming'}}
    $partial=Wait-ForGateway $true 0;
    @{ready=$ready;partial=$partial;reports=$script:reports}|ConvertTo-Json -Compress`);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.ready, true);
  assert.equal(data.partial, false);
  assert.equal(data.reports.length, 3);
  assert.match(data.reports[0], /Avvio processo/);
  assert.match(data.reports[1], /preparazione del motore AI/);
  assert.match(data.reports[2], /Server pronto/);
});

test('manual server start recovers only an enabled existing owner bridge in an interactive session', { skip: !windows }, () => {
  const result = run(`${functions(['Start-OwnerDesktopBridge'])}
    $desktopBridgeTaskName='Owner Bridge';$script:session=0;$script:started=@();
    $script:bridge=[pscustomobject]@{Settings=@{Enabled=$true};State='Ready'};
    function Get-Process {param($Id) [pscustomobject]@{SessionId=$script:session}}
    function Get-ScheduledTask {param($TaskName,$ErrorAction) $script:bridge}
    function Start-ScheduledTask {param($TaskName) $script:started += $TaskName;$script:bridge.State='Running'}
    function Write-Host {}
    Start-OwnerDesktopBridge;
    $script:session=1;$script:bridge.Settings.Enabled=$false;Start-OwnerDesktopBridge;
    $script:bridge.Settings.Enabled=$true;Start-OwnerDesktopBridge;Start-OwnerDesktopBridge;
    $script:bridge=$null;Start-OwnerDesktopBridge;
    ConvertTo-Json -InputObject @($script:started) -Compress`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['Owner Bridge']);
});

test('optional service bootstrap preserves literal manager paths and starts without waiting for readiness', { skip: !windows }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-optional-'));
  try {
    const managerPath = path.join(fixture, "manager [owner's].ps1");
    const marker = path.join(fixture, 'started.json');
    const logPath = path.join(fixture, "manager [owner's].startup.log");
    fs.writeFileSync(managerPath, `param([string]$Action)
      Start-Sleep -Seconds 1
      @{action=$Action;directory=(Get-Location).Path}|ConvertTo-Json -Compress|Set-Content -LiteralPath ${quote(marker)}
      Write-Output 'fixture-ready'`);
    const result = run(`${functions(['Start-NexusOptionalService'], path.join(root, 'scripts/lib/development-paths.ps1'))}
      Start-NexusOptionalService -ProjectRoot ${quote(fixture)} -Manager ${quote(managerPath)} -LogDirectory ${quote(fixture)};
      $returnedBeforeReady=-not(Test-Path -LiteralPath ${quote(marker)});
      $deadline=[DateTime]::UtcNow.AddSeconds(5);
      while((-not(Test-Path -LiteralPath ${quote(marker)}) -or -not(Test-Path -LiteralPath ${quote(logPath)})) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 100}
      @{asynchronous=$returnedBeforeReady;service=(Get-Content -LiteralPath ${quote(marker)} -Raw|ConvertFrom-Json)}|ConvertTo-Json -Compress`);
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.asynchronous, true);
    assert.deepEqual(data.service, { action: 'start', directory: fixture });
    assert.match(fs.readFileSync(logPath, 'utf8'), /fixture-ready/);
  } finally {
    assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

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

test('portable scanner bootstrap discovers existing tools without changing PATH or explicit host settings', { skip: !windows }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-scanner-bootstrap-'));
  try {
    const cache = path.join(fixture, 'cache', 'grype'); fs.mkdirSync(cache, { recursive: true });
    const scanner = path.join(fixture, 'grype.exe'); fs.writeFileSync(scanner, 'not executed');
    const result = run(`${functions(['Initialize-NexusScannerEnvironment'], path.join(root, 'scripts/lib/development-paths.ps1'))}
      $ErrorActionPreference='Stop'; $layout=[pscustomobject]@{ToolchainsRoot=${quote(fixture)}};
      $originalPath=$env:Path; $env:NEXUS_GRYPE_EXECUTABLE=''; $env:GRYPE_DB_CACHE_DIR='';
      Initialize-NexusScannerEnvironment -Layout $layout;
      $first=@{scanner=$env:NEXUS_GRYPE_EXECUTABLE;cache=$env:GRYPE_DB_CACHE_DIR;pathRetained=($env:Path -eq $originalPath)};
      $env:NEXUS_GRYPE_EXECUTABLE='explicit-scanner'; $env:GRYPE_DB_CACHE_DIR='explicit-cache';
      Initialize-NexusScannerEnvironment -Layout $layout;
      $second=@{scanner=$env:NEXUS_GRYPE_EXECUTABLE;cache=$env:GRYPE_DB_CACHE_DIR};
      $env:NEXUS_GRYPE_EXECUTABLE=''; $env:GRYPE_DB_CACHE_DIR='';$layout.ToolchainsRoot=Join-Path $layout.ToolchainsRoot 'absent';
      Initialize-NexusScannerEnvironment -Layout $layout;
      @{first=$first;second=$second;missingUnchanged=([string]::IsNullOrEmpty($env:NEXUS_GRYPE_EXECUTABLE) -and [string]::IsNullOrEmpty($env:GRYPE_DB_CACHE_DIR))}|ConvertTo-Json -Depth 4 -Compress`);
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.deepEqual(data.first, { scanner, cache, pathRetained: true });
    assert.deepEqual(data.second, { scanner: 'explicit-scanner', cache: 'explicit-cache' });
    assert.equal(data.missingUnchanged, true);
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
