<#
  @module scripts/manage-self-hosted-search
  @description Gestisce SearXNG locale mantenendo applicazione, configurazione e dati sull'SSD del progetto.
#>
param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = [IO.Path]::GetFullPath((Split-Path $projectRoot -Parent))
$dockerRoot = Join-Path $workspaceRoot '.toolchains\docker-desktop'
$dockerCli = Join-Path $dockerRoot 'resources\bin\docker.exe'
$dockerCompose = Join-Path $dockerRoot 'resources\bin\docker-compose.exe'
$dockerDesktop = Join-Path $dockerRoot 'Docker Desktop.exe'
$dockerConfig = Join-Path $workspaceRoot '.docker-config'
$serviceRoot = Join-Path $workspaceRoot '.services\searxng'
$settingsDirectory = Join-Path $serviceRoot 'config'
$settingsPath = Join-Path $settingsDirectory 'settings.yml'
$cacheDirectory = Join-Path $serviceRoot 'cache'
$templatePath = Join-Path $projectRoot 'config\searxng\settings.yml.template'
$composePath = Join-Path $projectRoot 'config\searxng\compose.yaml'
$healthUrl = 'http://127.0.0.1:8080/search?q=nexusnxs&format=json&language=it&safesearch=1'

#region 01 - Runtime Docker

if (-not (Test-Path -LiteralPath $dockerCli -PathType Leaf) -or -not (Test-Path -LiteralPath $dockerCompose -PathType Leaf)) {
  throw "Docker CLI portatile non trovato in $dockerRoot"
}

$env:PATH = "$(Split-Path $dockerCli -Parent);$env:PATH"
$env:DOCKER_CONFIG = $dockerConfig
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'

function Test-DockerReady {
  & $dockerCli info --format '{{.ServerVersion}}' *> $null
  return $LASTEXITCODE -eq 0
}

function Wait-DockerReady([int]$TimeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (Test-DockerReady) { return $true }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Wait-SearchReady([int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $payload = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 4
      if ($null -ne $payload.results) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)
  return $false
}

#endregion

#region 02 - Lifecycle ricerca

if ($Action -eq 'start') {
  [IO.Directory]::CreateDirectory($dockerConfig) | Out-Null
  [IO.Directory]::CreateDirectory($settingsDirectory) | Out-Null
  [IO.Directory]::CreateDirectory($cacheDirectory) | Out-Null
  $dockerConfigPath = Join-Path $dockerConfig 'config.json'
  if (-not (Test-Path -LiteralPath $dockerConfigPath -PathType Leaf)) {
    [IO.File]::WriteAllText($dockerConfigPath, "{}`n", [Text.UTF8Encoding]::new($false))
  }
  if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) {
    $secretBytes = [byte[]]::new(32)
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($secretBytes) } finally { $random.Dispose() }
    $secret = ([BitConverter]::ToString($secretBytes) -replace '-', '').ToLowerInvariant()
    $template = [IO.File]::ReadAllText($templatePath)
    [IO.File]::WriteAllText($settingsPath, $template.Replace('__NEXUS_SEARXNG_SECRET__', $secret), [Text.UTF8Encoding]::new($false))
  }
  if (-not (Test-DockerReady)) {
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  }
  if (-not (Wait-DockerReady)) { throw 'Docker Desktop non e diventato disponibile entro 90 secondi.' }
  & $dockerCompose -f $composePath up -d --pull never
  if ($LASTEXITCODE -ne 0) { throw 'Avvio del servizio di ricerca non riuscito.' }
  if (-not (Wait-SearchReady)) { throw 'SearXNG non ha superato la verifica JSON entro 60 secondi.' }
  Write-Output 'NexusNXS Search disponibile su loopback.'
  exit 0
}

if (-not (Test-DockerReady)) {
  if ($Action -eq 'status') { Write-Output 'Docker Desktop non attivo.'; exit 1 }
  throw 'Docker Desktop non attivo.'
}

if ($Action -eq 'stop') {
  & $dockerCompose -f $composePath down
  if ($LASTEXITCODE -ne 0) { throw 'Arresto del servizio di ricerca non riuscito.' }
  Write-Output 'NexusNXS Search arrestato; configurazione e cache conservate.'
  exit 0
}

if (Wait-SearchReady 5) {
  & $dockerCli ps --filter 'name=nexusnxs-searxng' --format 'NexusNXS Search: {{.Status}} | {{.Ports}}'
  exit 0
}

Write-Output 'NexusNXS Search non disponibile.'
exit 1

#endregion
