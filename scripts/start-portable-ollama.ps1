# @module scripts/start-portable-ollama
# @description Avvia Ollama usando la libreria modelli sullo stesso SSD di NEXUSNXS.

#region 01 — Risoluzione portabile

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\development-paths.ps1')
$developmentLayout = Get-NexusDevelopmentLayout -ProjectRoot $projectRoot
$modelsPath = Resolve-NexusOllamaModels -Layout $developmentLayout
$ollamaExecutable = Resolve-NexusOllamaExecutable -Layout $developmentLayout

if (-not $modelsPath) { throw 'Libreria Ollama non trovata sul volume del progetto o nei percorsi configurati.' }
if (-not $ollamaExecutable) { throw 'Runtime Ollama non trovato nel repository, nel volume del progetto o nel PATH.' }

#endregion
#region 02 — Avvio controllato

try {
  Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 2 | Out-Null
  throw 'Ollama è già attivo. Chiudi prima l''app Ollama nell''area di notifica e riprova.'
}
catch {
  if ($_.Exception.Message -like 'Ollama è già attivo*') { throw }
}

$env:OLLAMA_MODELS = $modelsPath
$env:OLLAMA_NOPRUNE = '1'
$env:OLLAMA_KEEP_ALIVE = '15m'
$env:OLLAMA_FLASH_ATTENTION = '1'
Write-Host "NEXUSNXS userà i modelli locali in $modelsPath"
Write-Host 'Lascia aperta questa finestra durante il debug. Premi Ctrl+C per fermare Ollama.'
& $ollamaExecutable serve

#endregion
