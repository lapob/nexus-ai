<#
  @module scripts/run-presence
  @description Runs the lightweight NexusNXS system presence without AI, databases or gateway ownership.
#>
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $projectRoot 'scripts\start-electron.js'
. (Join-Path $PSScriptRoot 'lib\development-paths.ps1')
$node = if ($env:NEXUS_NODE_EXECUTABLE) {
  if (-not (Test-Path -LiteralPath $env:NEXUS_NODE_EXECUTABLE -PathType Leaf)) { throw 'Runtime Node configurato non disponibile.' }
  $env:NEXUS_NODE_EXECUTABLE
} else { (Get-Command node.exe -ErrorAction Stop).Source }

#region System presence

# Docker Desktop requires the owner's interactive session when its engine is
# not running. Recover the optional services at login without opening the pet
# or coupling their readiness to the AI gateway.
if ($env:NEXUS_DESKTOP_BRIDGE_ONLY -eq '1') {
  foreach ($manager in @('manage-self-hosted-search.ps1', 'manage-local-image-service.ps1')) {
    Start-NexusOptionalService -ProjectRoot $projectRoot -Manager (Join-Path $PSScriptRoot $manager)
  }
}

Set-Location -LiteralPath $projectRoot
$logDirectory = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data\logs'
[IO.Directory]::CreateDirectory($logDirectory) | Out-Null
& $node $launcher --presence *>&1 | Out-File -LiteralPath (Join-Path $logDirectory 'presence-launcher.log') -Append -Encoding utf8
exit $LASTEXITCODE

#endregion
