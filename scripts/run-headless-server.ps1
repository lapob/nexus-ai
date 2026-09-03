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
$dataRoot = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data'
$secretDirectory = Join-Path $dataRoot 'secrets'
$qaSecretPath = Join-Path $secretDirectory 'qa-browser.key'
if (-not (Test-Path -LiteralPath $qaSecretPath -PathType Leaf)) {
  [System.IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
  $secretBytes = [byte[]]::new(48)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
  $secretValue = [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  [System.IO.File]::WriteAllText($qaSecretPath, $secretValue, [System.Text.UTF8Encoding]::new($false))
}
$env:NEXUS_QA_SECRET = [System.IO.File]::ReadAllText($qaSecretPath).Trim()
$env:NEXUS_QA_SECRET_FILE = $qaSecretPath

#region Headless gateway

Set-Location -LiteralPath $projectRoot
& $node $launcher --server
exit $LASTEXITCODE

#endregion
