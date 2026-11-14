<#
  @module scripts/server-watchdog
  @description Sorvegliante esterno del server NexusNXS (eseguito ogni 2 minuti da "NexusNXS Watchdog").
  L'attività "NexusNXS Server" riavvia il processo quando termina; questo controllo copre il caso che
  Windows non vede: processo vivo ma bloccato o mai pronto. Regole prudenti, come un health check di produzione:
  - pronto: azzera i fallimenti;
  - attività ferma: la riavvia subito;
  - non pronto per 3 controlli di fila (~6 min) e processo avviato da oltre 10 min: riavvio coordinato;
  - al massimo 2 riavvii l'ora (niente cicli), pausa durante manutenzione/rilasci (maintenance.flag < 2 h)
    o mentre un altro gestore sta già riavviando.
#>
# -DryRun: decide e stampa senza scrivere stato/registro né riavviare. -Port: solo per le prove.
param([switch]$DryRun, [int]$Port = 32145)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataRoot = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data'
$statePath = Join-Path $dataRoot 'metrics\watchdog-state.json'
$logPath = Join-Path $dataRoot 'logs\watchdog.log'
$maintenanceFlag = Join-Path $dataRoot 'maintenance.flag'
$manager = Join-Path $projectRoot 'scripts\manage-headless-server-task.ps1'
$taskName = 'NexusNXS Server'
[IO.Directory]::CreateDirectory((Split-Path $statePath)) | Out-Null
[IO.Directory]::CreateDirectory((Split-Path $logPath)) | Out-Null

#region Stato e registro

function Write-WatchdogLog([string]$Level, [string]$Message) {
  $line = [ordered]@{ timestamp = [DateTime]::UtcNow.ToString('o'); level = $Level; scope = 'watchdog'; message = $Message } | ConvertTo-Json -Compress
  if ($DryRun) { Write-Output "[dry-run] $Level $Message"; return }
  if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 1MB) {
    $tail = Get-Content -LiteralPath $logPath -Tail 2000
    [IO.File]::WriteAllLines($logPath, [string[]]$tail, [Text.UTF8Encoding]::new($false))
  }
  [IO.File]::AppendAllText($logPath, $line + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}

$state = @{ failures = 0; restarts = @() }
if (Test-Path -LiteralPath $statePath) {
  try {
    $saved = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
    $state.failures = [int]$saved.failures
    $state.restarts = @($saved.restarts | ForEach-Object { [DateTime]::Parse([string]$_).ToUniversalTime() })
  } catch { Write-WatchdogLog 'warn' 'Stato del watchdog illeggibile: ripartito da zero.' }
}
function Save-State {
  $payload = @{ failures = $state.failures; restarts = @($state.restarts | ForEach-Object { $_.ToString('o') }); checkedAt = [DateTime]::UtcNow.ToString('o') }
  if (-not $DryRun) { [IO.File]::WriteAllText($statePath, ($payload | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false)) }
}

#endregion

#region Controllo

if ((Test-Path -LiteralPath $maintenanceFlag) -and ((Get-Date) - (Get-Item -LiteralPath $maintenanceFlag).LastWriteTime).TotalHours -lt 2) {
  Write-Output 'Manutenzione in corso: nessun intervento.'
  exit 0
}
$ownerStopFlag = Join-Path $dataRoot 'server-stopped.flag'
if (Test-Path -LiteralPath $ownerStopFlag) {
  # Arresto voluto dal proprietario (console o gestore): rispettarlo fino al riavvio del PC.
  $bootTime = try { (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime } catch { [DateTime]::MinValue }
  if ((Get-Item -LiteralPath $ownerStopFlag).LastWriteTime -gt $bootTime) {
    Write-Output 'Server arrestato dal proprietario: nessun intervento.'
    exit 0
  }
  if (-not $DryRun) { Remove-Item -LiteralPath $ownerStopFlag -Force -ErrorAction SilentlyContinue }
  Write-WatchdogLog 'info' 'Arresto manuale precedente al riavvio del PC: sorveglianza ripresa.'
}
$managerBusy = @(Get-CimInstance Win32_Process -Filter "Name='pwsh.exe'" -ErrorAction SilentlyContinue |
  Where-Object { [string]$_.CommandLine -like '*manage-headless-server-task.ps1*' -and $_.ProcessId -ne $PID }).Count -gt 0
if ($managerBusy) { Write-Output 'Gestore del server gia attivo: nessun intervento.'; exit 0 }

$ready = $false
try { $ready = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/readyz" -TimeoutSec 8).status -eq 'ready' } catch { $ready = $false }
if ($ready) {
  if ($state.failures -gt 0) { Write-WatchdogLog 'info' "Server di nuovo pronto dopo $($state.failures) controlli falliti." }
  $state.failures = 0
  Save-State
  Write-Output 'Server pronto.'
  exit 0
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) { Write-Output 'Servizio server non installato: nessun intervento.'; exit 0 }
if ($task.State -ne 'Running') {
  Write-WatchdogLog 'warn' "Server non pronto e attivita in stato $($task.State): avvio."
  if (-not $DryRun -and $task.Settings.Enabled) { Start-ScheduledTask -TaskName $taskName }
  $state.failures = 0
  Save-State
  exit 0
}

$state.failures += 1
# Età del server dal suo lock (createdAt in ms); la riga di comando di un processo S4U spesso non è leggibile.
$ageMinutes = 0
try {
  $lock = [IO.File]::ReadAllText((Join-Path $dataRoot 'headless-server.lock')) | ConvertFrom-Json
  $ageMinutes = ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [long]$lock.createdAt) / 60000
} catch { $ageMinutes = 999 }
$hourAgo = [DateTime]::UtcNow.AddHours(-1)
$state.restarts = @($state.restarts | Where-Object { $_ -gt $hourAgo })
Write-WatchdogLog 'warn' "Server non pronto (controllo $($state.failures), processo attivo da $([int]$ageMinutes) min)."

if ($state.failures -ge 3 -and $ageMinutes -ge 10) {
  if ($state.restarts.Count -ge 2) {
    Write-WatchdogLog 'error' 'Server ancora non pronto ma limite di 2 riavvii l ora raggiunto: serve un controllo manuale.'
  } else {
    Write-WatchdogLog 'warn' 'Server bloccato: riavvio coordinato.'
    $state.restarts += [DateTime]::UtcNow
    $state.failures = 0
    Save-State
    if (-not $DryRun) {
      & (Get-Command pwsh.exe).Source -NoLogo -NoProfile -NonInteractive -File $manager -Action restart *>&1 | Out-Null
      Write-WatchdogLog ($(if ($LASTEXITCODE -eq 0) { 'info' } else { 'error' })) "Riavvio coordinato terminato con codice $LASTEXITCODE."
    }
    exit 0
  }
}
Save-State
exit 0

#endregion
