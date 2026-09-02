<#
  @module scripts/manage-nexus
  @description Entry point operativo unico per desktop, server, AI e Tailscale.
#>
param(
  [ValidateSet('start', 'stop', 'restart', 'status', 'repair')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverManager = Join-Path $PSScriptRoot 'manage-headless-server-task.ps1'
$desktopLauncher = Join-Path $PSScriptRoot 'start-electron.js'
$desktopPreflight = Join-Path $PSScriptRoot 'prepare-development.js'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$serverTaskNames = @('NexusNXS Server', 'Nexus AI Server')

#region 01 — Rilevamento e lifecycle

function Get-NexusProcesses {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $commandLine = [string]$_.CommandLine
    $executable = [string]$_.ExecutablePath
    $commandLine.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $executable.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  }
}

function Get-DesktopProcesses {
  @(Get-NexusProcesses | Where-Object {
    ($_.Name -eq 'electron.exe' -and $_.CommandLine -like '*electron.exe *' -and $_.CommandLine -notlike '*--server*' -and $_.CommandLine -notlike '*--presence*' -and $_.CommandLine -notlike '*--type=*') -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*start-electron.js*' -and $_.CommandLine -notlike '*--server*' -and $_.CommandLine -notlike '*--presence*')
  })
}

function Get-PresenceProcesses {
  @(Get-NexusProcesses | Where-Object {
    ($_.Name -eq 'electron.exe' -and $_.CommandLine -like '*--presence*' -and $_.CommandLine -notlike '*--type=*') -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*start-electron.js*' -and $_.CommandLine -like '*--presence*')
  })
}

function Test-HttpHealth([string]$Url) {
  try { return (Invoke-RestMethod -Uri $Url -TimeoutSec 3).status -eq 'ok' }
  catch { return $false }
}

function Get-PublicAiStatus {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'https://ai.nexusnxs.com/readyz' -TimeoutSec 5
    $payload = $response.Content | ConvertFrom-Json
    if ($response.StatusCode -eq 200 -and $payload.status -eq 'ready') { return 'online' }
    return "not-ready ($($response.StatusCode))"
  } catch {
    $statusCode = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    if ($statusCode -eq 401) {
      # Compatibilita rolling: alcune istanze precedenti proteggevano /readyz
      # ma lasciavano correttamente pubblico il solo endpoint di liveness.
      try {
        $legacyResponse = Invoke-WebRequest -UseBasicParsing -Uri 'https://ai.nexusnxs.com/healthz' -TimeoutSec 5
        $legacyPayload = $legacyResponse.Content | ConvertFrom-Json
        if ($legacyResponse.StatusCode -eq 200 -and $legacyPayload.status -eq 'ok') { return 'legacy-online' }
      } catch {
        # Conserva la classificazione originale quando anche liveness fallisce.
      }
    }
    switch ($statusCode) {
      401 { return 'authentication-required' }
      403 { return 'access-blocked' }
      404 { return 'route-missing' }
      502 { return 'origin-offline' }
      503 { return 'not-ready' }
      default { return 'offline' }
    }
  }
}

function Test-AiHealth {
  $endpoints = [System.Collections.Generic.List[string]]::new()
  # Il Core possiede un runtime Ollama su una porta privata derivata dal PID
  # (12000 + PID modulo 1000). La porta non viene salvata nelle preferenze:
  # cambia a ogni riavvio e non deve essere confusa con un Ollama globale.
  # Derivarla dal solo processo Core NexusNXS mantiene la diagnostica fedele
  # senza esporre o rendere configurabile il listener interno.
  foreach ($serverProcess in @(Get-NexusProcesses | Where-Object {
    $_.Name -eq 'electron.exe' -and
      $_.CommandLine -like '* --server*' -and
      $_.CommandLine -notlike '*--type=*'
  })) {
    $managedPort = 12000 + ([int]$serverProcess.ProcessId % 1000)
    $managedEndpoint = "http://127.0.0.1:$managedPort"
    if (-not $endpoints.Contains($managedEndpoint)) { $endpoints.Add($managedEndpoint) }
  }
  $dataRoot = if ($env:NEXUS_USER_DATA_ROOT) {
    [System.IO.Path]::GetFullPath($env:NEXUS_USER_DATA_ROOT)
  } else {
    Join-Path (Split-Path $projectRoot -Parent) '.nexus-data'
  }
  $settingsPath = Join-Path $dataRoot 'settings.json'
  if (Test-Path -LiteralPath $settingsPath) {
    try {
      $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
      $candidate = [uri]([string]$settings.baseUrl)
      $address = $null
      $isLoopback = $candidate.Scheme -eq 'http' -and (
        $candidate.Host -eq 'localhost' -or
        ([System.Net.IPAddress]::TryParse($candidate.Host, [ref]$address) -and [System.Net.IPAddress]::IsLoopback($address))
      )
      if ($isLoopback) { $endpoints.Add($candidate.GetLeftPart([System.UriPartial]::Authority)) }
    } catch {
      # Una configurazione corrotta non deve interrompere la diagnostica.
    }
  }
  foreach ($fallback in @('http://127.0.0.1:11435', 'http://127.0.0.1:11434')) {
    if (-not $endpoints.Contains($fallback)) { $endpoints.Add($fallback) }
  }
  foreach ($endpoint in $endpoints) {
    try {
      if ([bool](Invoke-RestMethod -Uri "$endpoint/api/version" -TimeoutSec 3).version) { return $true }
    } catch {
      # Prova il runtime gestito e infine quello di sistema senza accettare host remoti.
    }
  }
  return $false
}

function Get-NexusServerTask {
  foreach ($candidate in $serverTaskNames) {
    $task = Get-ScheduledTask -TaskName $candidate -ErrorAction SilentlyContinue
    if ($task) { return $task }
  }
  return $null
}

function Ensure-ServerTask {
  if (-not (Get-NexusServerTask)) {
    & $serverManager -Action install
  }
}

function Start-Desktop {
  if (@(Get-DesktopProcesses).Count) { return }
  & $node $desktopPreflight --mode=start
  if ($LASTEXITCODE -ne 0) {
    throw 'La preparazione dell interfaccia NexusNXS non è riuscita.'
  }
  $neutralWorkingDirectory = if ($env:SystemRoot) { $env:SystemRoot } else { [IO.Path]::GetPathRoot($projectRoot) }
  Start-Process -FilePath $node -ArgumentList @("`"$desktopLauncher`"") -WorkingDirectory $neutralWorkingDirectory -WindowStyle Hidden
}

function Wait-ForDesktop([int]$TimeoutSeconds = 20) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (@(Get-DesktopProcesses).Count) { return $true }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Stop-Desktop {
  $processes = @(Get-DesktopProcesses)
  if (-not $processes.Count) { return }
  $mainWindows = @($processes | Where-Object { $_.Name -eq 'electron.exe' })
  foreach ($process in $mainWindows) {
    # Prima consente a Electron di emettere before-quit: conversazioni, voce,
    # richieste AI e processi operativi vengono così chiusi ordinatamente.
    & taskkill.exe /PID ([string]$process.ProcessId) 2>$null | Out-Null
  }
  $deadline = (Get-Date).AddSeconds(5)
  while (@(Get-DesktopProcesses).Count -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
  }
  $processes = @(Get-DesktopProcesses)
  if (-not $processes.Count) { return }
  $processIds = @($processes.ProcessId | ForEach-Object { [int]$_ })
  $roots = @($processes | Where-Object { [int]$_.ParentProcessId -notin $processIds })
  if (-not $roots.Count) { $roots = $processes }
  foreach ($process in $roots) {
    # Limita l'arresto all'albero avviato dal launcher NexusNXS. In questo modo
    # npm stop comprende Electron, Chromium, voce, runtime AI e comandi ancora
    # in corso, senza toccare altri processi Node o applicazioni dell'utente.
    & taskkill.exe /PID ([string]$process.ProcessId) /T /F 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-NexusStatus {
  $tailscale = Get-Service Tailscale -ErrorAction SilentlyContinue
  $serverTask = Get-NexusServerTask
  [pscustomobject]@{
    Desktop = if (@(Get-DesktopProcesses).Count) { 'online' } else { 'offline' }
    Presence = if (@(Get-PresenceProcesses).Count) { 'online' } else { 'offline' }
    Server = if (Test-HttpHealth 'http://127.0.0.1:32145/healthz') { 'online' } else { 'offline' }
    PublicListener = if (Test-HttpHealth 'http://127.0.0.1:32147/healthz') { 'online' } else { 'offline' }
    PublicAPI = Get-PublicAiStatus
    AI = if (Test-AiHealth) { 'online' } else { 'offline' }
    Tailscale = if ($tailscale) { [string]$tailscale.Status } else { 'not-installed' }
    AutomaticStart = if ($serverTask) { [string]$serverTask.State } else { 'not-installed' }
  }
}

#endregion

#region 02 — Azioni operative

if ($Action -eq 'status') {
  Get-NexusStatus | Format-List
  exit 0
}

if ($Action -eq 'stop') {
  Stop-Desktop
  & $serverManager -Action stop
  Write-Output 'NexusNXS desktop e server sono stati arrestati.'
  exit 0
}

if ($Action -eq 'start') {
  Ensure-ServerTask
  # Comando manuale: assicura il Core e apre esplicitamente l'interfaccia.
  & $serverManager -Action start
  Start-Desktop
  if (-not (Wait-ForDesktop)) { throw 'L interfaccia NexusNXS non si è avviata entro 20 secondi.' }
  Write-Output 'NexusNXS avviato: server in background e interfaccia desktop disponibile.'
  Get-NexusStatus | Format-List
  exit 0
}

if ($Action -eq 'restart') {
  Ensure-ServerTask
  Stop-Desktop
  & $serverManager -Action restart
  Start-Desktop
  if (-not (Wait-ForDesktop)) { throw 'L interfaccia NexusNXS non si è riavviata entro 20 secondi.' }
  Write-Output 'NexusNXS riavviato completamente.'
  Get-NexusStatus | Format-List
  exit 0
}

# Repair è deliberatamente headless: non modifica account, Funnel, modelli o
# preferenze e non apre l'assistente. Ripristina soltanto i servizi configurati.
$tailscaleService = Get-Service Tailscale -ErrorAction SilentlyContinue
if ($tailscaleService -and $tailscaleService.Status -ne 'Running') {
  Start-Service Tailscale
}
Ensure-ServerTask
if (-not (Test-HttpHealth 'http://127.0.0.1:32145/healthz') -or
    -not (Test-HttpHealth 'http://127.0.0.1:32147/healthz') -or
    -not (Test-AiHealth)) {
  & $serverManager -Action restart
}
$status = Get-NexusStatus
if ($status.Server -ne 'online' -or $status.PublicListener -ne 'online' -or $status.AI -ne 'online') {
  throw 'Riparazione incompleta: esegui npm run nexus:status e consulta la dashboard tecnica.'
}
Write-Output 'Riparazione headless completata senza aprire l assistente o modificare dati e preferenze.'
$status | Format-List

#endregion
