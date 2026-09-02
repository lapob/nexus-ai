<#
  @module scripts/run-headless-server
  @description Runs the NexusNXS headless process without creating an interactive console window.
#>
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $projectRoot 'scripts\start-electron.js'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$env:NEXUS_PUBLIC_PORT = '32147'
$env:NEXUS_PUBLIC_URL = 'https://ai.nexusnxs.com'

#region Headless gateway

Set-Location -LiteralPath $projectRoot
& $node $launcher --server
exit $LASTEXITCODE

#endregion
