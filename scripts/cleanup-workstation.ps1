<#
  @module scripts/cleanup-workstation
  @description Rimuove soltanto cache e artefatti rigenerabili entro confini NexusNXS verificati.
#>
param(
  [switch]$IncludeSystemCaches,
  [switch]$IncludeLegacyResidues,
  [switch]$SkipRecycleBin
)

$ErrorActionPreference = 'Continue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nexusRoot = Split-Path -Parent $projectRoot
$expectedRoot = [System.IO.Path]::GetFullPath($nexusRoot)

if ((Split-Path -Leaf $expectedRoot) -ne 'NexusNXS') {
  throw "Radice NexusNXS non valida: $expectedRoot"
}

#region 01 — Confini e misurazione

function Get-TreeBytes([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return 0L }
  return [long]((Get-ChildItem -LiteralPath $Path -File -Force -Recurse -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum)
}

function Clear-ExactDirectory([string]$Path, [string[]]$AllowedRoots, [switch]$KeepRoot) {
  if (-not (Test-Path -LiteralPath $Path)) { return 0L }
  $resolved = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
  $allowed = $AllowedRoots | Where-Object {
    $root = [System.IO.Path]::GetFullPath($_)
    $resolved.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -or
      $resolved.StartsWith($root.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)
  }
  if (-not $allowed) { throw "Pulizia fuori dai confini consentiti: $resolved" }
  $bytes = Get-TreeBytes $resolved
  if ($KeepRoot) {
    Get-ChildItem -LiteralPath $resolved -Force -ErrorAction SilentlyContinue |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
  }
  return $bytes
}

#endregion
#region 02 — Inventario e pulizia consentita

$projectTargets = @(
  (Join-Path $nexusRoot '.nexus-data\tmp'),
  (Join-Path $projectRoot 'android\NexusRemote\app\build'),
  (Join-Path $projectRoot 'android\NexusRemote\.gradle'),
  (Join-Path $projectRoot 'android\NexusConsole\app\build'),
  (Join-Path $projectRoot 'android\NexusConsole\.gradle'),
  (Join-Path $projectRoot 'node_modules\.vite'),
  (Join-Path $projectRoot 'release\win-unpacked'),
  (Join-Path $nexusRoot '.site\.wrangler'),
  (Join-Path $nexusRoot '.site\.next'),
  (Join-Path $nexusRoot '.site\outputs\playwright'),
  (Join-Path $nexusRoot '.site\dist'),
  (Join-Path $nexusRoot '.toolchains\cache\npm\_npx'),
  (Join-Path $projectRoot 'artifacts\verification')
)
if ($IncludeLegacyResidues) { $projectTargets += (Join-Path $nexusRoot '.remote-power') }

$recovered = 0L
foreach ($target in $projectTargets) {
  $keep = $target.EndsWith('.nexus-data\tmp', [System.StringComparison]::OrdinalIgnoreCase)
  $recovered += Clear-ExactDirectory -Path $target -AllowedRoots @($expectedRoot) -KeepRoot:$keep
}

$obsoleteControl = Join-Path $projectRoot 'release-android\NexusNXS-Control-1.8.0-nexus-control.apk'
if (Test-Path -LiteralPath $obsoleteControl) {
  $resolvedControl = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $obsoleteControl).Path)
  $releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'release-android'))
  if ((Split-Path -Parent $resolvedControl) -ne $releaseRoot) { throw 'Release Android fuori confine.' }
  $recovered += (Get-Item -LiteralPath $resolvedControl).Length
  Remove-Item -LiteralPath $resolvedControl -Force
}

if ($IncludeSystemCaches) {
  $userCacheTargets = @(
    (Join-Path $env:LOCALAPPDATA 'npm-cache'),
    (Join-Path $env:USERPROFILE '.gradle\caches'),
    (Join-Path $env:LOCALAPPDATA 'CrashDumps'),
    (Join-Path $env:LOCALAPPDATA 'D3DSCache'),
    (Join-Path $env:LOCALAPPDATA 'NVIDIA\DXCache'),
    (Join-Path $env:LOCALAPPDATA 'NVIDIA\GLCache')
  )
  foreach ($target in $userCacheTargets) {
    $recovered += Clear-ExactDirectory -Path $target -AllowedRoots @($env:LOCALAPPDATA, $env:USERPROFILE)
  }
  $tempRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Temp'))
  $recovered += Clear-ExactDirectory -Path $tempRoot -AllowedRoots @($tempRoot) -KeepRoot
  if (-not $SkipRecycleBin) {
    try { Clear-RecycleBin -Force -ErrorAction SilentlyContinue } catch {}
  }
}

if ($IncludeLegacyResidues) {
  $tempRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Temp'))
  $legacyTemporaryItems = @(Get-ChildItem -LiteralPath $tempRoot -Force -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^(?:nexus-(?:actions|workflow|electron-smoke|motion-qa)[A-Za-z0-9-]*|NexusNXS(?:AsarExtract|PackagedProbe)|nexus-connections-final\.json|electron-download-[A-Za-z0-9]+)$'
  })
  foreach ($item in $legacyTemporaryItems) {
    $resolved = [System.IO.Path]::GetFullPath($item.FullName)
    if ((Split-Path -Parent $resolved) -ne $tempRoot) { throw "Temporaneo legacy fuori confine: $resolved" }
    $recovered += Clear-ExactDirectory -Path $resolved -AllowedRoots @($tempRoot)
  }

  $looseOllama = [System.IO.Path]::GetFullPath((Join-Path $env:APPDATA 'ollama app.exe'))
  if (Test-Path -LiteralPath $looseOllama) {
    $item = Get-Item -LiteralPath $looseOllama -Force
    if ($item.Name -ne 'ollama app.exe' -or (Split-Path -Parent $item.FullName) -ne [System.IO.Path]::GetFullPath($env:APPDATA)) {
      throw 'Eseguibile Ollama legacy fuori confine.'
    }
    $recovered += Clear-ExactDirectory -Path $looseOllama -AllowedRoots @([System.IO.Path]::GetFullPath($env:APPDATA))
  }

  $androidResidue = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Android'))
  if ((Test-Path -LiteralPath $androidResidue) -and -not @(Get-ChildItem -LiteralPath $androidResidue -Force -ErrorAction SilentlyContinue).Count) {
    Remove-Item -LiteralPath $androidResidue -Force
  }

  $androidStudioRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Google\AndroidStudio2026.1.2'))
  if (Test-Path -LiteralPath $androidStudioRoot) {
    $studioPatterns = @(
      'compile-server\nexusremote_*',
      'editor\nexusremote-*',
      'frameworks\detection\NexusRemote.*',
      'log\indexing-diagnostic\nexusremote.*',
      'projects\nexusremote.*'
    )
    foreach ($pattern in $studioPatterns) {
      foreach ($item in @(Get-ChildItem -Path (Join-Path $androidStudioRoot $pattern) -Force -ErrorAction SilentlyContinue)) {
        $recovered += Clear-ExactDirectory -Path $item.FullName -AllowedRoots @($androidStudioRoot)
      }
    }
  }

  $userOllamaRoot = [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.ollama'))
  $userOllamaCache = Join-Path $userOllamaRoot 'cache'
  if (Test-Path -LiteralPath $userOllamaCache) {
    $recovered += Clear-ExactDirectory -Path $userOllamaCache -AllowedRoots @($userOllamaRoot)
  }
}

Write-Output ([pscustomobject]@{
  ProjectRoot = $expectedRoot
  RecoveredMB = [math]::Round($recovered / 1MB, 1)
  SystemCachesIncluded = [bool]$IncludeSystemCaches
  LegacyResiduesIncluded = [bool]$IncludeLegacyResidues
  RecycleBinCleared = [bool]($IncludeSystemCaches -and -not $SkipRecycleBin)
})

#endregion
