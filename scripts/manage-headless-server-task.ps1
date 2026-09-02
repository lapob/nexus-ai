<#
  @module scripts/manage-headless-server-task
  @description Installs, removes, or inspects the portable headless server task.
#>
param(
  [ValidateSet('install', 'remove', 'start', 'stop', 'restart', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$taskName = 'NexusNXS Server'
$presenceTaskName = 'NexusNXS Presence'
$deviceCoreTaskName = 'NexusNXS Connectivity'
$legacyTaskName = 'Nexus AI Server'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pwshPath = (Get-Command pwsh.exe -ErrorAction Stop).Source
$runnerPath = Join-Path $projectRoot 'scripts\run-headless-server.ps1'
$shutdownRequester = Join-Path $projectRoot 'scripts\request-headless-shutdown.js'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$dataRoot = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data'
$headlessLockPath = Join-Path $dataRoot 'headless-server.lock'
$presenceLockPath = Join-Path $dataRoot 'system-presence.lock'
$gatewayPorts = @(32145, 32147)
$coldStartTimeoutSeconds = 360

#region Lifecycle helpers

function Get-GatewayReadiness([int]$Port) {
  try {
    $status = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/readyz" -TimeoutSec 1).status
    if ($status -eq 'ready') { return 'ready' }
    return 'offline'
  } catch {
    $statusCode = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    if ($statusCode -eq 503) {
      try {
        if ((Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 1).status -eq 'ok') {
          return 'warming'
        }
      } catch {}
      return 'offline'
    }
    if ($statusCode -notin @(401, 404)) { return 'offline' }
    # Compatibilita durante un aggiornamento: le versioni precedenti esponevano
    # soltanto /healthz oppure proteggevano /readyz. Il fallback sparisce al
    # primo avvio della nuova build, senza interrompere l'istanza gia attiva.
    try {
      if ((Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 1).status -eq 'ok') {
        return 'legacy'
      }
    } catch {}
    return 'offline'
  }
}

function Wait-ForGateway([bool]$Expected, [int]$TimeoutSeconds = 20) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $activePorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object LocalPort -in $gatewayPorts |
      Select-Object -ExpandProperty LocalPort -Unique)
    $portsReady = @($gatewayPorts | Where-Object { $_ -in $activePorts }).Count -eq $gatewayPorts.Count
    $ready = $false
    if ($portsReady) {
      $ready = @($gatewayPorts | Where-Object {
        (Get-GatewayReadiness -Port $_) -in @('ready', 'legacy')
      }).Count -eq $gatewayPorts.Count
    }
    $stopped = $activePorts.Count -eq 0
    if (($Expected -and $ready) -or (-not $Expected -and $stopped)) { return $true }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Get-InstalledTaskName {
  foreach ($candidate in @($taskName, $legacyTaskName)) {
    if (Get-ScheduledTask -TaskName $candidate -ErrorAction SilentlyContinue) { return $candidate }
  }
  return $null
}

function Stop-HeadlessProcessesForced {
  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $commandLine = [string]$_.CommandLine
    $executable = [string]$_.ExecutablePath
    $belongsToProject = $commandLine.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $executable.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $belongsToProject -and (
      ($_.Name -eq 'pwsh.exe' -and $commandLine -like '*run-headless-server.ps1*') -or
      ($_.Name -eq 'node.exe' -and $commandLine -like '*start-electron.js*--server*') -or
      ($_.Name -eq 'node.exe' -and $commandLine -like '*electron*cli.js*--server*') -or
      ($_.Name -eq 'electron.exe' -and $commandLine -like '*--server*')
    )
  })
  $processIds = @($processes.ProcessId | ForEach-Object { [int]$_ })
  $roots = @($processes | Where-Object { [int]$_.ParentProcessId -notin $processIds })
  if (-not $roots.Count) { $roots = $processes }
  foreach ($process in $roots) {
    & taskkill.exe /PID ([string]$process.ProcessId) /T /F 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Request-GracefulProcessShutdown([string]$LockPath) {
  if (-not (Test-Path -LiteralPath $LockPath)) { return $false }
  & $nodePath $shutdownRequester $LockPath 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Stop-PresenceProcess {
  $requested = Request-GracefulProcessShutdown -LockPath $presenceLockPath
  if ($requested) {
    $deadline = (Get-Date).AddSeconds(8)
    do {
      if (-not (Test-Path -LiteralPath $presenceLockPath)) { return }
      Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
  }
  Stop-ScheduledTask -TaskName $presenceTaskName -ErrorAction SilentlyContinue
}

function Stop-HeadlessServer([string]$InstalledTaskName) {
  # Le build correnti osservano una richiesta firmata con il nonce del lock e
  # attraversano app.quit()/shutdownApplication. Stop-ScheduledTask e taskkill
  # restano soltanto il fallback per una vecchia build o un processo bloccato.
  $requested = Request-GracefulProcessShutdown -LockPath $headlessLockPath
  if ($requested -and (Wait-ForGateway $false 12)) { return }
  if ($InstalledTaskName) {
    Stop-ScheduledTask -TaskName $InstalledTaskName -ErrorAction SilentlyContinue
  }
  if (Wait-ForGateway $false 3) { return }
  Stop-HeadlessProcessesForced
}

function Get-PortableTaskArguments([Parameter(Mandatory)][string]$EntryPoint) {
  $volumeRoot = [IO.Path]::GetPathRoot($projectRoot)
  $driveLetter = $volumeRoot.TrimEnd('\').TrimEnd(':')
  $volume = Get-Volume -DriveLetter $driveLetter -ErrorAction Stop
  if (-not $volume.UniqueId) { throw "Identita del volume non disponibile per $volumeRoot." }
  $entryPointFull = [IO.Path]::GetFullPath($EntryPoint)
  if (-not $entryPointFull.StartsWith($volumeRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'L entry point del task deve restare sul volume del progetto.'
  }
  $relativeEntryPoint = $entryPointFull.Substring($volumeRoot.Length)

  $uniqueId = ([string]$volume.UniqueId).Replace("'", "''")
  $relative = $relativeEntryPoint.Replace("'", "''")
  $command = @"
`$volume = Get-Volume | Where-Object { `$_.UniqueId -eq '$uniqueId' } | Select-Object -First 1
if (-not `$volume -or -not `$volume.DriveLetter) { exit 20 }
`$entryPoint = Join-Path (([string]`$volume.DriveLetter) + ':\') '$relative'
if (-not (Test-Path -LiteralPath `$entryPoint -PathType Leaf)) { exit 21 }
& `$entryPoint
"@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  return "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $encoded"
}

function Install-ServerTask {
  # La workstation usa --server come unico Core autorevole. Una vecchia attivita
  # --background della distribuzione pubblica condividerebbe lo stesso lock e
  # introdurrebbe una race al login. Anche la vecchia Presence automatica viene
  # rimossa: al login deve partire soltanto l'infrastruttura headless, mentre
  # l'assistente visibile resta un'applicazione esplicitamente on-demand.
  Unregister-ScheduledTask -TaskName $deviceCoreTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Stop-PresenceProcess
  Unregister-ScheduledTask -TaskName $presenceTaskName -Confirm:$false -ErrorAction SilentlyContinue
  $arguments = Get-PortableTaskArguments -EntryPoint $runnerPath
  $taskAction = New-ScheduledTaskAction -Execute $pwshPath -Argument $arguments -WorkingDirectory $env:SystemRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Runs only the headless NexusNXS gateway and local model runtime from the external SSD.' `
    -Force | Out-Null

  if ($legacyTaskName -ne $taskName) {
    Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false -ErrorAction SilentlyContinue
  }
  Write-Output "NexusNXS Server autostart installed from $projectRoot."
}

if ($Action -eq 'remove') {
  $installedTaskName = Get-InstalledTaskName
  # Rimuove anche una Presence automatica installata da versioni precedenti.
  Stop-PresenceProcess
  Stop-HeadlessServer -InstalledTaskName $installedTaskName
  if (-not (Wait-ForGateway $false)) {
    throw 'NexusNXS Server non ha liberato le porte 32145 e 32147 prima della rimozione.'
  }
  foreach ($candidate in @($taskName, $legacyTaskName)) {
    Unregister-ScheduledTask -TaskName $candidate -Confirm:$false -ErrorAction SilentlyContinue
  }
  Unregister-ScheduledTask -TaskName $presenceTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output 'NexusNXS Server autostart removed.'
  exit 0
}

if ($Action -in @('start', 'stop', 'restart')) {
  $installedTaskName = Get-InstalledTaskName
  $task = if ($installedTaskName) { Get-ScheduledTask -TaskName $installedTaskName -ErrorAction SilentlyContinue } else { $null }
  if (-not $task -and $Action -in @('start', 'restart')) {
    Install-ServerTask
    $installedTaskName = Get-InstalledTaskName
    $task = Get-ScheduledTask -TaskName $installedTaskName -ErrorAction Stop
  }
  if ($Action -in @('stop', 'restart')) {
    Stop-HeadlessServer -InstalledTaskName $installedTaskName
    if (-not (Wait-ForGateway $false)) {
      throw 'NexusNXS Server non ha liberato le porte 32145 e 32147 durante l arresto.'
    }
  }
  if ($Action -in @('start', 'restart')) {
    if (-not (Wait-ForGateway $true 1)) {
      Start-ScheduledTask -TaskName $installedTaskName
    }
    # Il primo avvio dopo un aggiornamento può includere la verifica del runtime
    # AI sull'SSD e la scansione antivirus del binario. Il gateway resta nascosto
    # e supervisionato, ma il gestore non deve dichiarare un falso errore mentre
    # l'avvio a freddo sta ancora procedendo correttamente.
    if (-not (Wait-ForGateway $true $coldStartTimeoutSeconds)) {
      throw "NexusNXS Server did not become ready within $coldStartTimeoutSeconds seconds."
    }
  }
  Write-Output "NexusNXS Server $($Action) completed."
  exit 0
}

#endregion

#region Status and installation

if ($Action -eq 'status') {
  $installedTaskName = Get-InstalledTaskName
  $task = if ($installedTaskName) { Get-ScheduledTask -TaskName $installedTaskName -ErrorAction SilentlyContinue } else { $null }
  if (-not $task) {
    Write-Output 'NexusNXS Server autostart is not installed.'
    exit 1
  }
  $info = Get-ScheduledTaskInfo -TaskName $installedTaskName
  $serverProcesses = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'electron.exe' -and $_.CommandLine -like '*--server*') -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*start-electron.js*--server*')
  }
  $presenceProcesses = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'electron.exe' -and $_.CommandLine -like '*--presence*') -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*start-electron.js*--presence*')
  }
  $processIds = @($serverProcesses.ProcessId | Where-Object { [int]$_ -gt 0 })
  $runtimeProcesses = if ($processIds.Count) {
    Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -in $processIds }
  } else { @() }
  $listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object LocalPort -eq 32145 | Select-Object -First 1
  $publicListener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object LocalPort -eq 32147 | Select-Object -First 1
  $health = Get-GatewayReadiness -Port 32145
  $tailscaleService = Get-Service Tailscale -ErrorAction SilentlyContinue
  $serveStatus = if (Get-Command tailscale.exe -ErrorAction SilentlyContinue) {
    (tailscale serve status 2>$null) -join [Environment]::NewLine
  } else { 'not installed' }
  $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($projectRoot).TrimEnd(':\'))
  $logPath = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data\logs\nexus.log'
  $lastLog = if (Test-Path -LiteralPath $logPath) {
    Get-Content -LiteralPath $logPath -Tail 1 -ErrorAction SilentlyContinue
  } else { '' }
  [pscustomobject]@{
    TaskName = $installedTaskName
    TaskState = $task.State
    AssistantAutostart = 'disabled'
    LastRunTime = $info.LastRunTime
    LastTaskResult = $info.LastTaskResult
    Health = $health
    Gateway = if ($listener) { "$($listener.LocalAddress):$($listener.LocalPort)" } else { 'offline' }
    PublicGateway = if ($publicListener) { "$($publicListener.LocalAddress):$($publicListener.LocalPort)" } else { 'offline' }
    ServerProcessIds = ($processIds -join ', ')
    AssistantProcessIds = (@($presenceProcesses.ProcessId | Where-Object { [int]$_ -gt 0 }) -join ', ')
    RuntimeProcesses = (@($runtimeProcesses.Name | Sort-Object -Unique) -join ', ')
    Tailscale = if ($tailscaleService) { "$($tailscaleService.Status) / $($tailscaleService.StartType)" } else { 'not installed' }
    TailscaleServe = $serveStatus
    ExternalDriveFreeGB = [math]::Round($drive.Free / 1GB, 1)
    ProjectRoot = $projectRoot
    DataRoot = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data'
    LastLogEvent = $lastLog
  } | Format-List
  exit 0
}

Install-ServerTask

#endregion
