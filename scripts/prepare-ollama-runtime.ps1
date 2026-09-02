# @module scripts/prepare-ollama-runtime
# @description Scarica e verifica il runtime ufficiale completo incluso nel setup NEXUSNXS.
param(
  [string]$Destination = (Join-Path $PSScriptRoot '..\vendor\ollama\windows-x64'),
  [string]$SourceDirectory = '',
  [switch]$ReplaceBlocked,
  [switch]$ForceUpdate,
  [switch]$KeepBackup
)

#region Configurazione e verifica del runtime esistente

$ErrorActionPreference = 'Stop'
# Windows PowerShell può vedere per primo il manifest di PowerShell 7 nello
# store WindowsApps e fallire l'autoload. Il modulo inbox è quello compatibile
# con questo script di packaging e con Get-AuthenticodeSignature.
$securityModule = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
Import-Module -Name $securityModule -Force -ErrorAction Stop
$baseUrl = 'https://ollama.com/download/ollama-windows-amd64.zip'
$rocmUrl = 'https://ollama.com/download/ollama-windows-amd64-rocm.zip'
$securityGate = Join-Path $PSScriptRoot 'check-ollama-runtime-security.js'
$node = (Get-Command node -ErrorAction Stop).Source
$destinationFull = [System.IO.Path]::GetFullPath($Destination)
$destinationParent = Split-Path -Parent $destinationFull
$sourceFull = if ([string]::IsNullOrWhiteSpace($SourceDirectory)) { '' } else { [System.IO.Path]::GetFullPath($SourceDirectory) }
$temporaryRoot = Join-Path $destinationParent ('.ollama-download-' + [Guid]::NewGuid().ToString('N'))
$baseArchive = Join-Path $temporaryRoot 'base.zip'
$rocmArchive = Join-Path $temporaryRoot 'rocm.zip'
$extract = Join-Path $temporaryRoot 'runtime'
$staging = Join-Path $destinationParent ('.ollama-staging-' + [Guid]::NewGuid().ToString('N'))
$backup = Join-Path $destinationParent ('.ollama-backup-' + [Guid]::NewGuid().ToString('N'))

function Save-RemoteFile([string]$Uri, [string]$LiteralDestination) {
  # Invoke-WebRequest -OutFile tratta le parentesi quadre del percorso come
  # wildcard in Windows PowerShell 5.1. Il progetto portatile vive spesso in
  # cartelle come [AI]; curl riceve invece l'argomento come percorso letterale,
  # segue i redirect e scrive in streaming senza tenere l'archivio in memoria.
  $curl = (Get-Command curl.exe -ErrorAction Stop).Source
  & $curl --fail --location --silent --show-error --output $LiteralDestination $Uri
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $LiteralDestination -PathType Leaf)) {
    throw "Download non riuscito: $Uri"
  }
}

function Expand-ArchiveLiteral([string]$LiteralArchive, [string]$LiteralDestination) {
  # Microsoft.PowerShell.Archive conserva la semantica wildcard anche con
  # -LiteralPath quando crea internamente la destinazione. bsdtar è incluso in
  # Windows e mantiene letterali sia archivio sia cartella [AI].
  $tar = (Get-Command tar.exe -ErrorAction Stop).Source
  & $tar -xf $LiteralArchive -C $LiteralDestination
  if ($LASTEXITCODE -ne 0) { throw "Estrazione non riuscita: $LiteralArchive" }
}

function Assert-OfficialRuntimeTree([string]$Root) {
  $required = @(
    'ollama.exe',
    'lib\ollama\ggml.dll',
    'lib\ollama\ggml-base.dll',
    'lib\ollama\cuda_v12\ggml-cuda.dll',
    'lib\ollama\cuda_v13\ggml-cuda.dll',
    'lib\ollama\rocm_v7_1\ggml-hip.dll',
    'lib\ollama\vulkan\ggml-vulkan.dll'
  )
  foreach ($relativePath in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $relativePath) -PathType Leaf)) {
      throw "Il runtime ufficiale è incompleto: manca $relativePath."
    }
  }
  $artifacts = @(Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll' })
  foreach ($artifact in $artifacts) {
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '\bOllama Inc\b') {
      throw "Firma ufficiale non valida per $($artifact.FullName): $($signature.Status)."
    }
  }
}

$existingExecutable = Join-Path $Destination 'ollama.exe'
$existingRocm = Join-Path $Destination 'lib\ollama\rocm_v7_1\ggml-hip.dll'
if (-not $ForceUpdate -and (Test-Path -LiteralPath $existingExecutable) -and (Test-Path -LiteralPath $existingRocm)) {
  $existingSignature = Get-AuthenticodeSignature -LiteralPath $existingExecutable
  if ($existingSignature.Status -eq 'Valid') {
    Assert-OfficialRuntimeTree -Root $Destination
    & $node $securityGate ('--executable=' + $existingExecutable) --development-loopback
    if ($LASTEXITCODE -eq 0) {
      if (-not $ReplaceBlocked) {
        Write-Host "Runtime AI completo già presente e verificato in $Destination"
        exit 0
      }
      Write-Host 'Aggiornamento esplicito richiesto: preparo una nuova versione ufficiale del runtime AI.'
    }
    elseif (-not $ReplaceBlocked) {
      throw 'Il runtime esistente non supera il gate. Per sostituirlo in futuro, arresta soltanto Ollama e ripeti con -ReplaceBlocked.'
    }
  }
}

if (Test-Path -LiteralPath $existingExecutable) {
  $existingResolved = (Resolve-Path -LiteralPath $existingExecutable).Path
  $runtimeInUse = @(Get-CimInstance Win32_Process -Filter "Name='ollama.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq $existingResolved) }).Count -gt 0
  if ($runtimeInUse) { throw 'Il runtime Ollama vendorizzato è in uso: nessun file è stato scaricato o sostituito.' }
}

#endregion

#region Download verificato e promozione atomica

try {
  New-Item -ItemType Directory -Force -Path $destinationParent, $temporaryRoot, $extract | Out-Null
  if ($sourceFull) {
    if (-not (Test-Path -LiteralPath $sourceFull -PathType Container)) {
      throw "La sorgente runtime non esiste: $sourceFull"
    }
    if ($sourceFull.TrimEnd('\') -ieq $destinationFull.TrimEnd('\')) {
      throw 'La sorgente runtime e la destinazione devono essere diverse.'
    }
    Assert-OfficialRuntimeTree -Root $sourceFull
    Write-Host "Importo il runtime ufficiale verificato da $sourceFull..."
    Copy-Item -LiteralPath (Join-Path $sourceFull 'ollama.exe') -Destination $extract -Force
    Copy-Item -LiteralPath (Join-Path $sourceFull 'lib') -Destination $extract -Recurse -Force
  }
  else {
    Write-Host 'Scarico il runtime AI ufficiale...'
    Save-RemoteFile -Uri $baseUrl -LiteralDestination $baseArchive
    Expand-ArchiveLiteral -LiteralArchive $baseArchive -LiteralDestination $extract
    Write-Host 'Aggiungo il backend AMD ROCm ufficiale...'
    Save-RemoteFile -Uri $rocmUrl -LiteralDestination $rocmArchive
    Expand-ArchiveLiteral -LiteralArchive $rocmArchive -LiteralDestination $extract
  }

  Assert-OfficialRuntimeTree -Root $extract
  $executable = Get-Item -LiteralPath (Join-Path $extract 'ollama.exe')
  $signature = Get-AuthenticodeSignature -LiteralPath $executable.FullName
  if ($signature.Status -ne 'Valid') { throw "Firma digitale del runtime non valida: $($signature.Status)." }
  & $node $securityGate ('--executable=' + $executable.FullName) --development-loopback
  if ($LASTEXITCODE -ne 0) { throw 'Il nuovo runtime ufficiale non supera il gate di sicurezza.' }

  New-Item -ItemType Directory -Force -Path $destinationParent, $staging | Out-Null
  # -Path interpreta le parentesi quadre presenti in alcuni volumi come wildcard.
  # Enumerare dal percorso letterale mantiene il provisioning portabile.
  Get-ChildItem -LiteralPath $extract -Force |
    Copy-Item -Destination $staging -Recurse -Force
  Assert-OfficialRuntimeTree -Root $staging
  $stagedExecutable = Join-Path $staging 'ollama.exe'
  & $node $securityGate ('--executable=' + $stagedExecutable) --development-loopback
  if ($LASTEXITCODE -ne 0) { throw 'La copia staged del runtime non supera il gate di sicurezza.' }

  $movedExisting = $false
  $promoted = $false
  try {
    if (Test-Path -LiteralPath $destinationFull) {
      Move-Item -LiteralPath $destinationFull -Destination $backup
      $movedExisting = $true
    }
    Move-Item -LiteralPath $staging -Destination $destinationFull
    $promoted = $true
    Assert-OfficialRuntimeTree -Root $destinationFull
    & $node $securityGate ('--executable=' + (Join-Path $destinationFull 'ollama.exe')) --development-loopback
    if ($LASTEXITCODE -ne 0) { throw 'Il runtime promosso non supera il gate di sicurezza.' }
  }
  catch {
    if ($promoted -and (Test-Path -LiteralPath $destinationFull)) {
      Move-Item -LiteralPath $destinationFull -Destination $staging -ErrorAction SilentlyContinue
    }
    if ($movedExisting -and -not (Test-Path -LiteralPath $destinationFull) -and (Test-Path -LiteralPath $backup)) {
      Move-Item -LiteralPath $backup -Destination $destinationFull
    }
    throw
  }
  if ($movedExisting -and (Test-Path -LiteralPath $backup)) {
    if ($KeepBackup) { Write-Host "Backup rollback conservato in $backup" }
    else { Remove-Item -LiteralPath $backup -Recurse -Force }
  }
  Write-Host "Runtime AI NVIDIA, AMD e Vulkan pronto in $destinationFull"
}
finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}

#endregion
