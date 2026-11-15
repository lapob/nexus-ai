# Avvia l'emulatore Android di prova per NexusNXS Control.
# Regola: solo rendering software (swiftshader), mai -gpu host. Con il rendering
# sulla GPU l'emulatore occupava ~10 GB di VRAM e il modello del server non
# entrava piu nella RX 9070 XT (warm-up in timeout). Chiuderlo a fine prove:
#   adb -s emulator-5554 emu kill
param([string]$Avd = 'NexusControl_Pixel9_API36')

$sdk = Join-Path $PSScriptRoot '..\..\.toolchains\android-sdk'
$emulator = Join-Path $sdk 'emulator\emulator.exe'
if (-not [IO.File]::Exists($emulator)) { throw "Emulatore non trovato: $emulator" }
Start-Process -FilePath $emulator -ArgumentList @('-avd', $Avd, '-gpu', 'swiftshader_indirect', '-no-snapshot-save', '-no-boot-anim')
Write-Output "Emulatore $Avd avviato con rendering software (nessuna VRAM)."
