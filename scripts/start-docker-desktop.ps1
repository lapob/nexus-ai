<#
  @module scripts/start-docker-desktop
  @description Verifica la registrazione della installazione Docker prima dell'avvio al login.
#>
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dockerRoot = Join-Path $workspaceRoot '.toolchains\docker-desktop'
$launcher = Join-Path $dockerRoot 'Docker Desktop.exe'
$record = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop'
if ($record.InstallLocation -ne $dockerRoot) { throw 'Installazione Docker non corrispondente.' }
if ((Get-AuthenticodeSignature -LiteralPath $launcher).Status -ne 'Valid') { throw 'Firma Docker non valida.' }
$launcherKey = 'HKCU:\Software\Docker Inc.\Docker Desktop'
if (-not (Test-Path -LiteralPath $launcherKey)) { New-Item -Path $launcherKey -Force | Out-Null }
New-ItemProperty -LiteralPath $launcherKey -Name InstallLocation -Value $dockerRoot -PropertyType String -Force | Out-Null
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $launcher
$startInfo.Arguments = '--autostart'
$startInfo.WorkingDirectory = $dockerRoot
$startInfo.UseShellExecute = $true
$startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
[Diagnostics.Process]::Start($startInfo) | Out-Null
