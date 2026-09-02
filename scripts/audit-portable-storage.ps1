<#
  @module scripts/audit-portable-storage
  @description Inventario in sola lettura della portabilita NexusNXS su Windows.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\development-paths.ps1')
$developmentLayout = Get-NexusDevelopmentLayout -ProjectRoot $projectRoot
$workspaceRoot = $developmentLayout.WorkspaceRoot
$portableDrive = $developmentLayout.VolumeRoot.TrimEnd('\')

function Get-PathState {
  param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)][string]$Path)
  $resolved = [Environment]::ExpandEnvironmentVariables($Path)
  [pscustomobject]@{
    Component = $Label
    Location = $resolved
    Exists = Test-Path -LiteralPath $resolved
    Portable = $resolved.StartsWith($portableDrive, [StringComparison]::OrdinalIgnoreCase)
  }
}

$ollamaModels = Resolve-NexusOllamaModels -Layout $developmentLayout
if (-not $ollamaModels) { $ollamaModels = Join-Path $developmentLayout.WorkspaceRoot '.ollama' }
$androidSdk = Resolve-NexusAndroidSdk -Layout $developmentLayout -RequiredRelativePaths @()
if (-not $androidSdk) { $androidSdk = @(Get-NexusAndroidSdkCandidates -Layout $developmentLayout)[0] }
$gradleHome = Find-NexusExistingDirectory -Candidates @(Get-NexusGradleHomeCandidates -Layout $developmentLayout) -BasePath $workspaceRoot
if (-not $gradleHome) { $gradleHome = Join-Path $developmentLayout.ToolchainsRoot 'gradle' }
$javaHome = Resolve-NexusJavaHome -Layout $developmentLayout
if (-not $javaHome) { $javaHome = Join-Path $developmentLayout.ToolchainsRoot 'jdk' }
$items = @(
  Get-PathState 'Application source' $projectRoot
  Get-PathState 'Application data' (Join-Path $workspaceRoot '.nexus-data')
  Get-PathState 'Public knowledge' (Join-Path $workspaceRoot '.knowledge-public')
  Get-PathState 'Private knowledge' (Join-Path $workspaceRoot '.knowledge-private')
  Get-PathState 'Vendored Ollama runtime' (Join-Path $projectRoot 'vendor\ollama\windows-x64')
  Get-PathState 'Ollama models' $ollamaModels
  Get-PathState 'Android SDK' $androidSdk
  Get-PathState 'Gradle home' $gradleHome
  Get-PathState 'Java home' $javaHome
  Get-PathState 'Tailscale service' (Join-Path $env:ProgramFiles 'Tailscale')
  Get-PathState 'Cloudflared state' (Join-Path $env:ProgramData 'cloudflared')
)

$items | Format-Table -AutoSize

$knownPortable = $items | Where-Object { $_.Exists -and $_.Portable }
$knownSystem = $items | Where-Object { $_.Exists -and -not $_.Portable }
Write-Host ""
Write-Host ("Portatili: {0} | Dipendenze/stato Windows: {1}" -f $knownPortable.Count, $knownSystem.Count)
Write-Host 'Audit in sola lettura: nessun file, servizio o credenziale e stato modificato.'

if ($knownSystem.Count -gt 0) {
  Write-Host 'Nota: i servizi Windows, i driver, il registro, Event Log e pagefile non possono essere resi zero-trace scollegando il disco.'
}
