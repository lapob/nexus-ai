<#
  @module scripts/refresh-desktop-shortcut
  @description Refreshes the desktop app link using an owner-local destination, separate from server startup.
#>
param([string]$Destination = '', [string]$Executable = '')
$ErrorActionPreference = 'Stop'
#region Local configuration
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$configPath = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data\desktop-shortcut.json'
if (-not $Destination) {
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Configure a desktop shortcut destination first.' }
  $Destination = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).destination
}
if (-not $Executable) { $Executable = Join-Path $env:LOCALAPPDATA 'Programs\NexusNXS\NexusNXS.exe' }
if (-not (Test-Path -LiteralPath $Destination -PathType Container)) { throw 'Shortcut destination does not exist.' }
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'Installed desktop application is missing.' }
$Destination = (Resolve-Path -LiteralPath $Destination).Path
$Executable = (Resolve-Path -LiteralPath $Executable).Path
#endregion
#region Link and verification
$shell = New-Object -ComObject WScript.Shell
$linkPath = Join-Path $Destination 'NexusNXS.lnk'
try {
  $link = $shell.CreateShortcut($linkPath)
  $link.TargetPath = $Executable
  $link.Arguments = '--ui'
  $link.WorkingDirectory = Split-Path $Executable -Parent
  $link.IconLocation = "$Executable,0"
  $link.Description = 'NexusNXS'
  $link.Save()
  $verified = $shell.CreateShortcut($linkPath)
  if ($verified.TargetPath -ne $Executable -or $verified.Arguments -ne '--ui') { throw 'Shortcut verification failed.' }
  [IO.File]::WriteAllText($configPath, (@{destination=$Destination} | ConvertTo-Json))
  Write-Output 'Desktop app shortcut refreshed and verified.'
} finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null }
#endregion
