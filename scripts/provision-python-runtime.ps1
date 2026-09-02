<#
.SYNOPSIS
  Installa il runtime Python portabile soltanto dopo la verifica SHA-256.
.DESCRIPTION
  @module scripts/provision-python-runtime
  Scarica sullo stesso SSD del progetto, estrae in staging e promuove atomicamente
  esclusivamente il runtime approvato in config/python-runtime.json.
#>
[CmdletBinding()]
param(
  [string]$ArchivePath
)

#region Manifest approvato e confini dei percorsi

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vendorRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'vendor\python'))
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'config\python-runtime.json') -Raw | ConvertFrom-Json
$trustedVersion = '3.13.15'
$trustedRelease = '20260814'
$trustedSha256 = '4ca61e4b09c2240cc50cc6910c90664051e93ab7caa2f48b3c6b3c070670c0bd'
$trustedUrl = 'https://github.com/astral-sh/python-build-standalone/releases/download/20260814/cpython-3.13.15%2B20260814-x86_64-pc-windows-msvc-install_only.tar.gz'

function Assert-ChildPath([string]$Candidate, [string]$Parent) {
  $full = [IO.Path]::GetFullPath($Candidate)
  $prefix = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Percorso non consentito fuori da $Parent`: $full"
  }
  return $full
}

if ($manifest.pythonVersion -ne $trustedVersion -or $manifest.release -ne $trustedRelease -or
    $manifest.sha256.ToLowerInvariant() -ne $trustedSha256 -or $manifest.downloadUrl -ne $trustedUrl) {
  throw 'Il manifest Python non coincide con la release ufficiale approvata.'
}

#endregion

#region Provisioning verificato e promozione atomica

New-Item -ItemType Directory -Path $vendorRoot -Force | Out-Null
$finalRuntime = Assert-ChildPath (Join-Path $projectRoot $manifest.runtimeDirectory) $vendorRoot
if (Test-Path -LiteralPath $finalRuntime) {
  throw "Runtime già presente; verificarlo con npm run check:python-runtime: $finalRuntime"
}

$stagingRoot = Assert-ChildPath (Join-Path $vendorRoot ('.provisioning-' + [Guid]::NewGuid().ToString('N'))) $vendorRoot
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
$downloadedArchive = $false
try {
  if ($ArchivePath) {
    $archive = [IO.Path]::GetFullPath($ArchivePath)
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "Archivio non trovato: $archive" }
    if ([IO.Path]::GetPathRoot($archive) -ne [IO.Path]::GetPathRoot($projectRoot)) {
      throw "L'archivio deve risiedere sullo stesso SSD del progetto."
    }
  } else {
    $archive = Join-Path $stagingRoot $manifest.asset
    Invoke-WebRequest -Uri $manifest.downloadUrl -OutFile $archive -UseBasicParsing
    $downloadedArchive = $true
  }

  $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($archiveHash -ne $trustedSha256) {
    throw "SHA-256 archivio non valido: $archiveHash"
  }

  $extractRoot = Join-Path $stagingRoot 'extracted'
  New-Item -ItemType Directory -Path $extractRoot | Out-Null
  & tar.exe -xzf $archive -C $extractRoot
  if ($LASTEXITCODE -ne 0) { throw "Estrazione runtime fallita con codice $LASTEXITCODE" }
  $candidate = Assert-ChildPath (Join-Path $extractRoot 'python') $extractRoot
  $python = Join-Path $candidate 'python.exe'
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "python.exe assente nell'archivio verificato." }

  $version = (& $python -I -c 'import sys; print(".".join(map(str, sys.version_info[:3])))').Trim()
  if ($LASTEXITCODE -ne 0 -or $version -ne $manifest.pythonVersion) {
    throw "Versione Python inattesa: $version"
  }

  foreach ($property in $manifest.runtimeFiles.PSObject.Properties) {
    $file = Join-Path $candidate ($property.Name -replace '/', '\')
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "File runtime mancante: $($property.Name)" }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $property.Value.ToLowerInvariant()) { throw "Digest runtime errato: $($property.Name)" }
  }

  foreach ($relative in $manifest.removedComponents) {
    $component = Assert-ChildPath (Join-Path $candidate ($relative -replace '/', '\')) $candidate
    if (Test-Path -LiteralPath $component) { Remove-Item -LiteralPath $component -Recurse -Force }
  }
  Get-ChildItem -LiteralPath $candidate -Recurse -File -Filter '*.pdb' | ForEach-Object {
    $pdb = Assert-ChildPath $_.FullName $candidate
    Remove-Item -LiteralPath $pdb -Force
  }

  $marker = [ordered]@{
    pythonVersion = $manifest.pythonVersion
    release = $manifest.release
    asset = $manifest.asset
    sha256 = $manifest.sha256
    provisionedAt = [DateTimeOffset]::UtcNow.ToString('o')
  }
  $marker | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $candidate '.nexus-python-runtime.json') -Encoding utf8
  Move-Item -LiteralPath $candidate -Destination $finalRuntime
  Write-Output "Runtime Python $version verificato e installato in $finalRuntime"
} finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    $verifiedStaging = Assert-ChildPath $stagingRoot $vendorRoot
    Remove-Item -LiteralPath $verifiedStaging -Recurse -Force
  }
}

#endregion
