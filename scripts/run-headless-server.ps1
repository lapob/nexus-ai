<#
  @module scripts/run-headless-server
  @description Runs the NexusNXS headless process without creating an interactive console window.
#>
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = Split-Path $projectRoot -Parent
$launcher = Join-Path $projectRoot 'scripts\start-electron.js'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$env:NEXUS_PUBLIC_PORT = '32147'
$env:NEXUS_PUBLIC_URL = 'https://ai.nexusnxs.com'
$env:NEXUS_WEB_SEARCH_PROVIDER = 'auto'
$env:NEXUS_SEARXNG_URL = 'http://127.0.0.1:8080/'
$imageRuntimeConfig = [IO.File]::ReadAllText((Join-Path $projectRoot 'config\local-image-runtime.json')) | ConvertFrom-Json
$env:NEXUS_IMAGE_API_MODE = [string]$imageRuntimeConfig.provider
$env:NEXUS_IMAGE_API_URL = [string]$imageRuntimeConfig.endpoint
$env:NEXUS_IMAGE_MODEL = [string]$imageRuntimeConfig.model.name
$env:NEXUS_IMAGE_TIMEOUT_MS = [string]$imageRuntimeConfig.timeoutMs
$env:NEXUS_IMAGE_OUTPUT_ROOT = Join-Path $workspaceRoot '.services\comfyui\app\output'
# The dedicated public listener binds only to loopback behind cloudflared.
$env:NEXUS_TRUST_PUBLIC_CLOUDFLARE = '1'
$dataRoot = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data'
$secretDirectory = Join-Path $dataRoot 'secrets'
$qaSecretPath = Join-Path $secretDirectory 'qa-browser.key'
if (-not (Test-Path -LiteralPath $qaSecretPath -PathType Leaf)) {
  [System.IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
  $secretBytes = [byte[]]::new(48)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
  $secretValue = [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  [System.IO.File]::WriteAllText($qaSecretPath, $secretValue, [System.Text.UTF8Encoding]::new($false))
}
$env:NEXUS_QA_SECRET = [System.IO.File]::ReadAllText($qaSecretPath).Trim()
$env:NEXUS_QA_SECRET_FILE = $qaSecretPath

# Il motore di ricerca e confinato al loopback e viene gestito dallo stesso
# avvio headless. Un errore del container non deve impedire chat e voce.
function Start-OptionalService([string]$Manager) {
  # An unavailable auxiliary service must never delay the public gateway.
  # Each manager owns its readiness/recovery and exits after starting its daemon.
  $serviceStart = [Diagnostics.ProcessStartInfo]::new()
  $serviceStart.FileName = (Get-Command pwsh.exe -ErrorAction Stop).Source
  $serviceStart.WorkingDirectory = $projectRoot
  $serviceStart.UseShellExecute = $false
  $serviceStart.CreateNoWindow = $true
  $serviceStart.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  foreach ($argument in @('-NoProfile', '-File', $Manager, '-Action', 'start')) {
    $serviceStart.ArgumentList.Add($argument)
  }
  try { [Diagnostics.Process]::Start($serviceStart) | Out-Null }
  catch { Write-Warning "Avvio servizio opzionale non riuscito: $($_.Exception.Message)" }
}
$searchManager = Join-Path $projectRoot 'scripts\manage-self-hosted-search.ps1'
Start-OptionalService $searchManager

# Anche il generatore immagini resta loopback-only e parte senza finestre.
# Se l'accelerazione o il modello non sono pronti, il Core rimane disponibile
# e dichiara correttamente la capability immagini come degradata.
$imageManager = Join-Path $projectRoot 'scripts\manage-local-image-service.ps1'
Start-OptionalService $imageManager

#region Headless gateway

Set-Location -LiteralPath $projectRoot
& $node $launcher --server
exit $LASTEXITCODE

#endregion
