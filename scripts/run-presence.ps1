<#
  @module scripts/run-presence
  @description Runs the lightweight NexusNXS system presence without AI, databases or gateway ownership.
#>
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $projectRoot 'scripts\start-electron.js'
$node = if ($env:NEXUS_NODE_EXECUTABLE) {
  if (-not (Test-Path -LiteralPath $env:NEXUS_NODE_EXECUTABLE -PathType Leaf)) { throw 'Runtime Node configurato non disponibile.' }
  $env:NEXUS_NODE_EXECUTABLE
} else { (Get-Command node.exe -ErrorAction Stop).Source }

#region System presence

Set-Location -LiteralPath $projectRoot
$logDirectory = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data\logs'
[IO.Directory]::CreateDirectory($logDirectory) | Out-Null
& $node $launcher --presence *>&1 | Out-File -LiteralPath (Join-Path $logDirectory 'presence-launcher.log') -Append -Encoding utf8
exit $LASTEXITCODE

#endregion
