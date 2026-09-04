<#
  @module scripts/manage-local-image-service
  @description Gestisce ComfyUI ROCm locale senza finestre e con listener limitato al loopback.
#>
param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = [IO.Path]::GetFullPath((Split-Path $projectRoot -Parent))
$serviceRoot = Join-Path $workspaceRoot '.services\comfyui'
$appRoot = Join-Path $serviceRoot 'app'
$python = Join-Path $serviceRoot 'venv\Scripts\python.exe'
$runtimeConfigPath = Join-Path $projectRoot 'config\local-image-runtime.json'
if (-not (Test-Path -LiteralPath $runtimeConfigPath -PathType Leaf)) { throw 'Configurazione immagini locale assente.' }
$runtimeConfig = [IO.File]::ReadAllText($runtimeConfigPath) | ConvertFrom-Json
$modelName = [string]$runtimeConfig.model.name
$expectedModelBytes = [long]$runtimeConfig.model.expectedBytes
$modelPath = Join-Path $appRoot "models\checkpoints\$modelName"
$pidPath = Join-Path $serviceRoot 'nexusnxs-image.pid'
$logDirectory = Join-Path $serviceRoot 'logs'
$stdoutPath = Join-Path $logDirectory 'service.stdout.log'
$stderrPath = Join-Path $logDirectory 'service.stderr.log'
$healthUrl = 'http://127.0.0.1:8188/system_stats'

function Get-NeutralWorkspaceAlias {
  if ($workspaceRoot -notmatch '[\[\]]') { return $workspaceRoot }
  $driveRoot = [IO.Path]::GetPathRoot($workspaceRoot)
  $aliasPath = Join-Path $driveRoot 'NXS'
  if (Test-Path -LiteralPath $aliasPath) {
    $aliasItem = Get-Item -LiteralPath $aliasPath -Force
    $target = @($aliasItem.Target)[0]
    if (-not $target -or [IO.Path]::GetFullPath([string]$target) -ne $workspaceRoot) {
      throw "L'alias portabile $aliasPath esiste ma non punta a $workspaceRoot"
    }
    return $aliasPath
  }
  New-Item -ItemType Junction -Path $aliasPath -Target $workspaceRoot -ErrorAction Stop | Out-Null
  return $aliasPath
}

$neutralWorkspaceRoot = Get-NeutralWorkspaceAlias
$neutralServiceRoot = Join-Path $neutralWorkspaceRoot '.services\comfyui'
$neutralAppRoot = Join-Path $neutralServiceRoot 'app'
$neutralPython = Join-Path $neutralServiceRoot 'venv\Scripts\python.exe'
$neutralStdoutPath = Join-Path $neutralServiceRoot 'logs\service.stdout.log'
$neutralStderrPath = Join-Path $neutralServiceRoot 'logs\service.stderr.log'

#region 01 - Stato e processo

function Test-ImageReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch { return $false }
}

function Get-ManagedImageProcess {
  if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) { return $null }
  $servicePid = [int]([IO.File]::ReadAllText($pidPath).Trim())
  if ($servicePid -le 0) { return $null }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $servicePid" -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  $commandLine = [string]$process.CommandLine
  if ([IO.Path]::GetFileName([string]$process.ExecutablePath) -ne 'python.exe' -or $commandLine -notlike '*main.py*') { return $null }
  return $process
}

function Wait-ImageReady([int]$TimeoutSeconds = 180) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (Test-ImageReady) { return $true }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)
  return $false
}

#endregion

#region 02 - Lifecycle

if ($Action -eq 'start') {
  if (Test-ImageReady) { Write-Output 'NexusNXS Images gia disponibile su loopback.'; exit 0 }
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "Runtime ComfyUI non trovato in $serviceRoot" }
  if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'main.py') -PathType Leaf)) { throw 'Applicazione ComfyUI non installata.' }
  if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) { throw "Modello immagini non installato: $modelName" }
  if ((Get-Item -LiteralPath $modelPath).Length -ne $expectedModelBytes) { throw "Modello immagini incompleto: $modelName" }
  [IO.Directory]::CreateDirectory($logDirectory) | Out-Null
  $arguments = @(
    "`"$(Join-Path $neutralAppRoot 'main.py')`"",
    '--listen', '127.0.0.1',
    '--port', '8188',
    '--disable-auto-launch',
    '--disable-metadata'
  )
  # Windows PowerShell interpreta [AI] come wildcard nei parametri di
  # Start-Process. L'alias e una junction verificata sullo stesso volume: non
  # duplica dati e segue automaticamente la lettera corrente dell'SSD.
  $process = Start-Process -FilePath $neutralPython -ArgumentList $arguments -WorkingDirectory $neutralAppRoot -WindowStyle Hidden -RedirectStandardOutput $neutralStdoutPath -RedirectStandardError $neutralStderrPath -PassThru
  [IO.File]::WriteAllText($pidPath, [string]$process.Id, [Text.UTF8Encoding]::new($false))
  if (-not (Wait-ImageReady)) {
    $tail = if (Test-Path -LiteralPath $stderrPath) { (Get-Content -LiteralPath $stderrPath -Tail 8 -ErrorAction SilentlyContinue) -join ' ' } else { '' }
    throw "ComfyUI non e diventato disponibile entro 180 secondi. $tail"
  }
  Write-Output "NexusNXS Images disponibile su 127.0.0.1:8188 con $modelName."
  exit 0
}

if ($Action -eq 'stop') {
  $process = Get-ManagedImageProcess
  if ($process) { Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction Stop }
  if (Test-Path -LiteralPath $pidPath) { [IO.File]::Delete($pidPath) }
  Write-Output 'NexusNXS Images arrestato.'
  exit 0
}

$listener = Get-NetTCPConnection -State Listen -LocalPort 8188 -ErrorAction SilentlyContinue | Select-Object -First 1
if ((Test-ImageReady) -and $listener -and $listener.LocalAddress -in @('127.0.0.1', '::1')) {
  $process = Get-ManagedImageProcess
  [pscustomobject]@{
    State = 'available'
    Endpoint = "$($listener.LocalAddress):8188"
    ProcessId = if ($process) { $process.ProcessId } else { '' }
    Model = $modelName
    Storage = $serviceRoot
  } | Format-List
  exit 0
}

Write-Output 'NexusNXS Images non disponibile.'
exit 1

#endregion
