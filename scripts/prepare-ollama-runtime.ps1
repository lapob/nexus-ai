# @module scripts/prepare-ollama-runtime
# @description Scarica e verifica il runtime ufficiale completo incluso nel setup NEXUSNXS.
param(
  [string]$Destination = (Join-Path $PSScriptRoot '..\vendor\ollama\windows-x64'),
  [string]$SourceDirectory = '',
  [string]$BaseArchivePath = '',
  [string]$RocmArchivePath = '',
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
$runtimeManifestPath = Join-Path $PSScriptRoot '..\config\ollama-runtime.json'
$runtimeManifest = [IO.File]::ReadAllText($runtimeManifestPath) | ConvertFrom-Json
if ($runtimeManifest.schemaVersion -ne 1 -or $runtimeManifest.version -notmatch '^\d+\.\d+\.\d+$') {
  throw 'Manifest del runtime Ollama non valido.'
}
foreach ($archiveKind in @('base', 'rocm')) {
  $archiveMetadata = $runtimeManifest.archives.$archiveKind
  $assetName = if ($archiveKind -eq 'base') { 'ollama-windows-amd64.zip' } else { 'ollama-windows-amd64-rocm.zip' }
  $expectedUrl = 'https://github.com/ollama/ollama/releases/download/v' + $runtimeManifest.version + '/' + $assetName
  if ($archiveMetadata.url -cne $expectedUrl -or $archiveMetadata.sha256 -notmatch '^[a-f0-9]{64}$' -or $archiveMetadata.bytes -le 0) {
    throw 'Origine o integrita del runtime Ollama non valida.'
  }
}
if ($SourceDirectory -and ($BaseArchivePath -or $RocmArchivePath)) { throw 'Scegli una sorgente runtime oppure gli archivi verificati.' }
if ([bool]$BaseArchivePath -ne [bool]$RocmArchivePath) { throw 'Servono entrambi gli archivi del runtime.' }
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

function Resolve-VerifiedRuntimeArchive([string]$InputArchive, [string]$RemoteUri, [string]$DownloadPath, [string]$ExpectedSha256, [long]$ExpectedBytes) {
  $archivePath = if ($InputArchive) { [IO.Path]::GetFullPath($InputArchive) } else { $DownloadPath }
  if (-not $InputArchive) { Save-RemoteFile -Uri $RemoteUri -LiteralDestination $archivePath }
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { throw 'Archivio runtime non disponibile.' }
  if ((Get-Item -LiteralPath $archivePath).Length -ne $ExpectedBytes) { throw 'Dimensione archivio runtime non valida.' }
  $stream = [IO.File]::OpenRead($archivePath)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $actualSha256 = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $hasher.Dispose() }
  if ($actualSha256 -cne $ExpectedSha256) {
    throw 'SHA256 archivio runtime non valido.'
  }
  return $archivePath
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
    # Official GPU bundles also contain the Microsoft Visual C++ runtime.
    # Restrict that publisher exception to these exact redistributable names.
    $ollamaSigned = $signature.SignerCertificate.Subject -match '\bOllama Inc\b'
    $microsoftRuntime = $artifact.Name -in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll') -and
      $signature.SignerCertificate.Subject -match '(?:^|,\s*)O=Microsoft Corporation(?:,|$)'
    if ($signature.Status -ne 'Valid' -or -not ($ollamaSigned -or $microsoftRuntime)) {
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
    & $node $securityGate ('--executable=' + $existingExecutable)
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
    $verifiedBase = Resolve-VerifiedRuntimeArchive -InputArchive $BaseArchivePath -RemoteUri $runtimeManifest.archives.base.url -DownloadPath $baseArchive -ExpectedSha256 $runtimeManifest.archives.base.sha256 -ExpectedBytes $runtimeManifest.archives.base.bytes
    $verifiedRocm = Resolve-VerifiedRuntimeArchive -InputArchive $RocmArchivePath -RemoteUri $runtimeManifest.archives.rocm.url -DownloadPath $rocmArchive -ExpectedSha256 $runtimeManifest.archives.rocm.sha256 -ExpectedBytes $runtimeManifest.archives.rocm.bytes
    Expand-ArchiveLiteral -LiteralArchive $verifiedBase -LiteralDestination $extract
    Write-Host 'Aggiungo il backend AMD ROCm ufficiale...'
    Expand-ArchiveLiteral -LiteralArchive $verifiedRocm -LiteralDestination $extract
  }

  Assert-OfficialRuntimeTree -Root $extract
  $executable = Get-Item -LiteralPath (Join-Path $extract 'ollama.exe')
  $signature = Get-AuthenticodeSignature -LiteralPath $executable.FullName
  if ($signature.Status -ne 'Valid') { throw "Firma digitale del runtime non valida: $($signature.Status)." }
  & $node $securityGate ('--executable=' + $executable.FullName)
  if ($LASTEXITCODE -ne 0) { throw 'Il nuovo runtime ufficiale non supera il gate di sicurezza.' }

  New-Item -ItemType Directory -Force -Path $destinationParent, $staging | Out-Null
  # -Path interpreta le parentesi quadre presenti in alcuni volumi come wildcard.
  # Enumerare dal percorso letterale mantiene il provisioning portabile.
  Get-ChildItem -LiteralPath $extract -Force |
    Copy-Item -Destination $staging -Recurse -Force
  Assert-OfficialRuntimeTree -Root $staging
  $stagedExecutable = Join-Path $staging 'ollama.exe'
  & $node $securityGate ('--executable=' + $stagedExecutable)
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
    & $node $securityGate ('--executable=' + (Join-Path $destinationFull 'ollama.exe'))
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
