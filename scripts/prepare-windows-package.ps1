<#
.SYNOPSIS
  Prepara in sicurezza il pacchetto Windows di NexusNXS.
.DESCRIPTION
  @module scripts/prepare-windows-package
  Arresta soltanto i processi avviati dalla cartella del pacchetto generato.
#>
# Stops only processes launched from the generated Windows package.
# Development and system-wide AI runtimes are intentionally left untouched.

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'release\win-unpacked'))

if (-not (Test-Path -LiteralPath $releaseRoot)) {
  exit 0
}

$releasePrefix = $releaseRoot.TrimEnd('\') + '\'
$targets = Get-CimInstance Win32_Process | Where-Object {
  $path = $_.ExecutablePath
  $path -and $path.StartsWith($releasePrefix, [System.StringComparison]::OrdinalIgnoreCase)
}

foreach ($target in ($targets | Sort-Object ProcessId -Descending)) {
  try {
    Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
  } catch {
    Write-Warning "Impossibile arrestare il processo di build $($target.ProcessId): $($_.Exception.Message)"
  }
}

if ($targets) {
  Start-Sleep -Milliseconds 500
}
