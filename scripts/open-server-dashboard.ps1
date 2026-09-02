<#
  @module scripts/open-server-dashboard
  @description Starts NexusNXS if needed and opens its live dashboard visibly in PowerShell 7.
#>
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manager = Join-Path $PSScriptRoot 'manage-headless-server-task.ps1'
$dashboard = Join-Path $PSScriptRoot 'server-dashboard.ps1'
$pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source

& $manager -Action start
Push-Location -LiteralPath $env:SystemRoot
try {
  Start-Process $pwsh `
    -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $dashboard)) `
    -WindowStyle Normal
} finally {
  Pop-Location
}

Write-Output 'NexusNXS Server is running. The live dashboard was opened in PowerShell 7.'
