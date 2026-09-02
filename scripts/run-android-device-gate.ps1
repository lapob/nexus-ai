<#
  @module scripts/run-android-device-gate
  @description Esegue entrambe le matrici Android su un dispositivo reale e fallisce su layout o frame insufficienti.
#>
$ErrorActionPreference = 'Stop'
$matrix = Join-Path $PSScriptRoot 'capture-android-visual-matrix.ps1'

& $matrix -App Control -RequireDevice -MaxJankyPercent 18
& $matrix -App Public -RequireDevice -MaxJankyPercent 18

Write-Output 'Android physical-device gate: PASS.'
