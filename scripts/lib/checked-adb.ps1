<#
  @module scripts/lib/checked-adb
  @description Arresta la verifica se ADB non completa il comando richiesto.
#>
function Invoke-CheckedAdb {
  # $adb viene risolto dalla toolchain del chiamante. Non riportare argomenti
  # completi: possono contenere testo digitato o riferimenti del dispositivo.
  & $adb @args
  if ($LASTEXITCODE -ne 0) {
    throw "Comando ADB fallito (exit $LASTEXITCODE). Verifica interrotta."
  }
}
