<#
  @module scripts/benchmark-android-ui
  @description Misura avvio reale e frame UI di NexusNXS per Android su un dispositivo Android collegato.
#>
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\development-paths.ps1')
$developmentLayout = Get-NexusDevelopmentLayout -ProjectRoot $projectRoot
$sdkRoot = Resolve-NexusAndroidSdk -Layout $developmentLayout -RequiredRelativePaths @('platform-tools\adb.exe')
if (-not $sdkRoot) { throw 'ADB non trovato. Imposta NEXUS_ANDROID_SDK oppure collega una toolchain Android portatile.' }
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$deviceLine = & $adb devices | Select-String "\sdevice$" | Select-Object -First 1
$device = if ($deviceLine) { ($deviceLine.Line -split "`t")[0] } else { "" }
if (-not $device) { throw "Nessun dispositivo Android collegato." }
$package = "local.nexus.remote"
$samples = 1..5 | ForEach-Object {
    & $adb -s $device shell am force-stop $package | Out-Null
    $result = & $adb -s $device shell am start -W -n "$package/.NexusMainActivity"
    [int](($result | Select-String "TotalTime:").Line -replace "\D", "")
}
& $adb -s $device shell dumpsys gfxinfo $package reset | Out-Null
$sizeLine = (& $adb -s $device shell wm size | Select-String "Physical size").Line
$displayWidth, $displayHeight = (($sizeLine -replace '.*: ', '') -split 'x') | ForEach-Object { [int]$_ }
function Tap-Ratio([double]$x, [double]$y) { & $adb -s $device shell input tap ([int]($displayWidth * $x)) ([int]($displayHeight * $y)) | Out-Null }
1..10 | ForEach-Object {
    # Composer testuale on-demand: apertura, IME e ritorno al Core.
    Tap-Ratio .60 .91
    Start-Sleep -Milliseconds 260
    & $adb -s $device shell input keyevent 4 | Out-Null
    Start-Sleep -Milliseconds 260
}
$gfx = & $adb -s $device shell dumpsys gfxinfo $package

# Percorsi percepiti più sensibili: Core, cattura vocale e composer/IME.
# Le coordinate sono normalizzate sulla superficie Compose e scalate sul display.
& $adb -s $device shell am force-stop $package | Out-Null
& $adb -s $device shell am start -n "$package/.NexusMainActivity" | Out-Null
# Escludiamo esplicitamente cold start, primo probe e caricamento modelli: sono
# misurati sopra e non devono contaminare il benchmark delle sole transizioni.
Start-Sleep -Milliseconds 1400
& $adb -s $device shell dumpsys gfxinfo $package reset | Out-Null
Tap-Ratio .50 .43 # Core -> cattura vocale
Start-Sleep -Milliseconds 220
& $adb -s $device shell input keyevent 4 | Out-Null
Start-Sleep -Milliseconds 220
Tap-Ratio .60 .91 # composer testuale
Start-Sleep -Milliseconds 260
& $adb -s $device shell input keyevent 4 | Out-Null
Start-Sleep -Milliseconds 260
$criticalGfx = & $adb -s $device shell dumpsys gfxinfo $package
[pscustomobject]@{
    Device = $device
    ColdStartMedianMs = ($samples | Sort-Object)[2]
    ColdStartSamplesMs = $samples -join ","
    TotalFrames = (($gfx | Select-String "Total frames rendered:").Line -replace "\D", "")
    JankyFrames = (($gfx | Select-String "Janky frames:").Line | Select-Object -First 1)
    CriticalTransitions = (($criticalGfx | Select-String "Janky frames:").Line | Select-Object -First 1)
    RefreshRate = ((& $adb -s $device shell dumpsys display | Select-String 'renderFrameRate' | Select-Object -First 1).Line -replace '.*renderFrameRate\s+', '' -replace ',.*', '')
}
