<#
  @module scripts/capture-android-visual-matrix
  @description Installa e cattura una matrice reale di NexusNXS Control, ripristinando sempre display e font del dispositivo.
#>
param(
  [ValidateSet('Control', 'Public')][string]$App = 'Control',
  [string]$ApkPath = "",
  [string]$OutputDirectory = "",
  [ValidateRange(1, 100)][double]$MaxJankyPercent = 18,
  [switch]$RequireDevice
)
$ErrorActionPreference = 'Stop'

#region 01 — Dispositivo, applicazione e profili

$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\development-paths.ps1')
$layout = Get-NexusDevelopmentLayout -ProjectRoot $projectRoot
$sdkRoot = Resolve-NexusAndroidSdk -Layout $layout -RequiredRelativePaths @('platform-tools\adb.exe')
if (-not $sdkRoot) { throw 'ADB non trovato nella toolchain portatile NexusNXS.' }
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$deviceLine = & $adb devices | Select-String "\sdevice$" | Select-Object -First 1
$device = if ($deviceLine) { ($deviceLine.Line -split "`t")[0] } else { '' }
if (-not $device) {
  if ($RequireDevice) { throw 'Nessun dispositivo Android collegato.' }
  Write-Output 'Android visual matrix: SKIPPED (nessun dispositivo collegato).'
  exit 0
}

if (-not $ApkPath) {
  $ApkPath = Join-Path $projectRoot $(if ($App -eq 'Public') { 'release-android\NexusNXS-Android.apk' } else { 'release-android\NexusNXS-Control.apk' })
}
if (-not (Test-Path -LiteralPath $ApkPath)) { throw "APK non trovato: $ApkPath" }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot $(if ($App -eq 'Public') { 'qa-artifacts\android-public-matrix' } else { 'qa-artifacts\android-control-matrix' }) }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$package = if ($App -eq 'Public') { 'local.nexus.remote' } else { 'local.nexus.console' }
$activity = if ($App -eq 'Public') { "$package/.NexusMainActivity" } else { "$package/.NativeMainActivity" }
$sizeState = (& $adb -s $device shell wm size) -join "`n"
$densityState = (& $adb -s $device shell wm density) -join "`n"
$fontScale = ((& $adb -s $device shell settings get system font_scale) -join '').Trim()
$profiles = @(
  @{ Name = 'phone-small'; Size = '720x1280'; Density = '320'; Font = '1.0' },
  @{ Name = 'phone-compact'; Size = '1080x2400'; Density = '480'; Font = '1.0' },
  @{ Name = 'phone-large-font'; Size = '1080x2400'; Density = '480'; Font = '2.0' },
  @{ Name = 'phone-landscape'; Size = '2400x1080'; Density = '480'; Font = '1.0' },
  @{ Name = 'tablet'; Size = '1600x2560'; Density = '320'; Font = '1.0' }
)

function Restore-Display {
  $overrideSize = [regex]::Match($sizeState, 'Override size:\s*(\d+x\d+)').Groups[1].Value
  $overrideDensity = [regex]::Match($densityState, 'Override density:\s*(\d+)').Groups[1].Value
  if ($overrideSize) { & $adb -s $device shell wm size $overrideSize | Out-Null } else { & $adb -s $device shell wm size reset | Out-Null }
  if ($overrideDensity) { & $adb -s $device shell wm density $overrideDensity | Out-Null } else { & $adb -s $device shell wm density reset | Out-Null }
  if ($fontScale) { & $adb -s $device shell settings put system font_scale $fontScale | Out-Null }
}

#endregion
#region 02 — Installazione, cattura e ripristino

try {
  & $adb -s $device install -r $ApkPath | Out-Null
  $frameMetrics = @()
  $jankFailures = @()
  foreach ($profile in $profiles) {
    & $adb -s $device shell wm size $profile.Size | Out-Null
    & $adb -s $device shell wm density $profile.Density | Out-Null
    & $adb -s $device shell settings put system font_scale $profile.Font | Out-Null
    & $adb -s $device shell am force-stop $package | Out-Null
    & $adb -s $device shell dumpsys gfxinfo $package reset | Out-Null
    & $adb -s $device shell am start -W -n $activity | Out-Null
    Start-Sleep -Milliseconds 1400
    $remotePng = "/sdcard/$($profile.Name).png"
    $remoteXml = "/sdcard/$($profile.Name).xml"
    & $adb -s $device shell screencap -p $remotePng | Out-Null
    & $adb -s $device shell uiautomator dump $remoteXml | Out-Null
    & $adb -s $device pull $remotePng (Join-Path $OutputDirectory "$($profile.Name).png") | Out-Null
    & $adb -s $device pull $remoteXml (Join-Path $OutputDirectory "$($profile.Name).xml") | Out-Null
    & $adb -s $device shell rm $remotePng $remoteXml | Out-Null
    $gfxInfo = (& $adb -s $device shell dumpsys gfxinfo $package) -join "`n"
    $totalMatch = [regex]::Match($gfxInfo, 'Total frames rendered:\s*(\d+)')
    $jankyMatch = [regex]::Match($gfxInfo, 'Janky frames:\s*(\d+)\s*\(([\d\.,]+)%\)')
    $totalFrames = if ($totalMatch.Success) { [int]$totalMatch.Groups[1].Value } else { 0 }
    $jankyFrames = if ($jankyMatch.Success) { [int]$jankyMatch.Groups[1].Value } else { 0 }
    $jankyPercent = if ($jankyMatch.Success) {
      [double]::Parse($jankyMatch.Groups[2].Value.Replace(',', '.'), [Globalization.CultureInfo]::InvariantCulture)
    } else { $null }
    $frameMetrics += [pscustomobject]@{
      Profile = $profile.Name
      TotalFrames = $totalFrames
      JankyFrames = $jankyFrames
      JankyPercent = $jankyPercent
    }
    if ($null -eq $jankyPercent -or $totalFrames -lt 20) {
      if ($RequireDevice) { $jankFailures += "$($profile.Name): metriche gfxinfo insufficienti" }
    } elseif ($jankyPercent -gt $MaxJankyPercent) {
      $jankFailures += "$($profile.Name): $jankyPercent% > $MaxJankyPercent%"
    }
  }
  [pscustomobject]@{
    Device = $device
    App = $App
    Package = $package
    CapturedAt = (Get-Date).ToString('o')
    Profiles = @($profiles.Name)
    FrameMetrics = $frameMetrics
    MaxJankyPercent = $MaxJankyPercent
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'manifest.json') -Encoding utf8
  if ($jankFailures.Count) { throw "Budget frame Android non rispettato: $($jankFailures -join '; ')" }
  if ($App -eq 'Control') {
    # La release privata usa FLAG_SECURE: screenshot neri sono il comportamento
    # atteso. La gerarchia UI resta acquisita per verificare layout, contenuti e
    # collisioni senza indebolire la protezione della schermata operativa.
    $emptyLayouts = @($profiles | Where-Object {
      $xmlPath = Join-Path $OutputDirectory "$($_.Name).xml"
      -not (Test-Path -LiteralPath $xmlPath) -or (Get-Item -LiteralPath $xmlPath).Length -lt 1000
    })
    if ($emptyLayouts.Count) { throw "Layout Control non acquisito: $($emptyLayouts.Name -join ', ')" }
    Write-Output "Android secure layout matrix: PASS ($($profiles.Count) profili; screenshot protetti da FLAG_SECURE)."
  } else {
    Write-Output "Android visual matrix: PASS ($($profiles.Count) profili in $OutputDirectory)."
  }
}
finally {
  Restore-Display
  & $adb -s $device shell am force-stop $package | Out-Null
  & $adb -s $device shell am start -n $activity | Out-Null
}

#endregion
