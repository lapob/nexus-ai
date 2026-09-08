<#
  @module scripts/cleanup-workstation
  @description Pianifica la pulizia di artefatti rigenerabili con confini verificati e report.
#>
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$nexusRoot = [IO.Path]::GetFullPath((Split-Path -Parent $projectRoot))
if ((Split-Path -Leaf $nexusRoot) -ne 'NexusNXS') { throw 'Radice NexusNXS non valida.' }

#region 01 - Inventario chiuso e confini

# Non includere dati, release installabili, report QA, cache in uso o cartelle di sistema.
$relativeTargets = @(
  'qa-artifacts\ollama-candidate\windows.zip',
  'qa-artifacts\ollama-candidate\rocm.zip',
  'android\NexusRemote\app\build',
  'android\NexusConsole\app\build'
)

function Assert-OrdinaryPath([string]$Path) {
  $full = [IO.Path]::GetFullPath($Path)
  if (-not $full.StartsWith($projectRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Percorso fuori progetto: $full"
  }
  $cursor = $full
  while ($cursor) {
    $item = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
    if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Collegamento escluso dalla pulizia: $cursor"
    }
    $cursor = Split-Path -Parent $cursor
  }
}

function Get-OrdinaryTree([string]$Path) {
  Assert-OrdinaryPath $Path
  $item = Get-Item -LiteralPath $Path -Force
  $item
  if ($item.PSIsContainer) {
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force) {
      Get-OrdinaryTree $child.FullName
    }
  }
}

$plan = @()
foreach ($relative in $relativeTargets) {
  $target = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
  Assert-OrdinaryPath $target
  if (-not (Test-Path -LiteralPath $target)) { continue }
  $tree = @(Get-OrdinaryTree $target)
  $bytes = [long](($tree | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum)
  $plan += [pscustomobject]@{ RelativePath = $relative; Bytes = $bytes; Removed = $false }
}

# Non modificare output mentre Gradle/Kotlin potrebbe ancora utilizzarli.
if ($Apply -and @($plan | Where-Object { $_.RelativePath.StartsWith('android\') }).Count) {
  $builders = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^java(w)?\.exe$' -and $_.CommandLine -match 'Gradle|Kotlin'
  })
  if ($builders.Count) { throw 'Gradle/Kotlin attivo: terminare la compilazione e arrestare i daemon prima della pulizia.' }
}

#endregion
#region 02 - Applicazione esplicita e rendiconto

$reportDirectory = Join-Path $projectRoot 'qa-artifacts'
Assert-OrdinaryPath $reportDirectory
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
$reportPath = Join-Path $reportDirectory 'cleanup-latest.json'
Assert-OrdinaryPath $reportPath
$report = [ordered]@{ GeneratedAt = [DateTime]::UtcNow.ToString('o'); Apply = [bool]$Apply; Items = $plan; RecoveredBytes = 0L }
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8
foreach ($entry in $plan) {
  $target = Join-Path $projectRoot $entry.RelativePath
  if ($Apply -and $PSCmdlet.ShouldProcess($target, 'Rimuovi artefatto rigenerabile')) {
    $null = @(Get-OrdinaryTree $target)
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
    if (Test-Path -LiteralPath $target) { throw "Rimozione incompleta: $target" }
    $entry.Removed = $true
    $report.RecoveredBytes += $entry.Bytes
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8
  }
}
$report | ConvertTo-Json -Depth 5

#endregion
