<#
  @module scripts/run-presence
  @description Runs the lightweight NexusNXS system presence without AI, databases or gateway ownership.
#>
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $projectRoot 'scripts\start-electron.js'
$node = (Get-Command node.exe -ErrorAction Stop).Source

#region System presence

Set-Location -LiteralPath $projectRoot
& $node $launcher --presence
exit $LASTEXITCODE

#endregion
