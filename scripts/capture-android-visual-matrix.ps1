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
. (Join-Path $PSScriptRoot 'lib\checked-adb.ps1')
$deviceLine = Invoke-CheckedAdb devices | Select-String "\sdevice$" | Select-Object -First 1
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
$apkSha256 = (Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot $(if ($App -eq 'Public') { 'qa-artifacts\android-public-matrix' } else { 'qa-artifacts\android-control-matrix' }) }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$package = if ($App -eq 'Public') { 'local.nexus.remote' } else { 'local.nexus.console' }
$activity = if ($App -eq 'Public') { "$package/.NexusMainActivity" } else { "$package/.NativeMainActivity" }
$sizeState = (Invoke-CheckedAdb -s $device shell wm size) -join "`n"
$densityState = (Invoke-CheckedAdb -s $device shell wm density) -join "`n"
$fontScale = ((Invoke-CheckedAdb -s $device shell settings get system font_scale) -join '').Trim()
$rotationMode = ((Invoke-CheckedAdb -s $device shell settings get system accelerometer_rotation) -join '').Trim()
$userRotation = ((Invoke-CheckedAdb -s $device shell settings get system user_rotation) -join '').Trim()
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
  if ($overrideSize) { Invoke-CheckedAdb -s $device shell wm size $overrideSize | Out-Null } else { Invoke-CheckedAdb -s $device shell wm size reset | Out-Null }
  if ($overrideDensity) { Invoke-CheckedAdb -s $device shell wm density $overrideDensity | Out-Null } else { Invoke-CheckedAdb -s $device shell wm density reset | Out-Null }
  if ($fontScale) { Invoke-CheckedAdb -s $device shell settings put system font_scale $fontScale | Out-Null }
  if ($userRotation) { Invoke-CheckedAdb -s $device shell settings put system user_rotation $userRotation | Out-Null }
  if ($rotationMode) { Invoke-CheckedAdb -s $device shell settings put system accelerometer_rotation $rotationMode | Out-Null }
}

#endregion
#region 02 — Installazione, cattura e ripristino

try {
  Invoke-CheckedAdb -s $device shell settings put system accelerometer_rotation 0 | Out-Null
  Invoke-CheckedAdb -s $device shell settings put system user_rotation 0 | Out-Null
  Invoke-CheckedAdb -s $device install -r $ApkPath | Out-Null
  $frameMetrics = @()
  $jankFailures = @()
  foreach ($profile in $profiles) {
    Invoke-CheckedAdb -s $device shell wm size $profile.Size | Out-Null
    Invoke-CheckedAdb -s $device shell wm density $profile.Density | Out-Null
    Invoke-CheckedAdb -s $device shell settings put system font_scale $profile.Font | Out-Null
    Invoke-CheckedAdb -s $device shell am force-stop $package | Out-Null
    Invoke-CheckedAdb -s $device shell dumpsys gfxinfo $package reset | Out-Null
    Invoke-CheckedAdb -s $device shell am start -W -n $activity | Out-Null
    # Capture the settled visualizer, not its deliberate full-screen assembly.
    Start-Sleep -Milliseconds 5200
    $remotePng = "/sdcard/$($profile.Name).png"
    $remoteXml = "/sdcard/$($profile.Name).xml"
    Invoke-CheckedAdb -s $device shell screencap -p $remotePng | Out-Null
    # UI automation can be killed during an Android display reconfiguration.
    # Retry only this read-only capture, retaining a hard failure after three attempts.
    for ($captureAttempt = 0; $captureAttempt -lt 3; $captureAttempt++) {
      try { Invoke-CheckedAdb -s $device shell uiautomator dump $remoteXml | Out-Null; break }
      catch { if ($captureAttempt -eq 2) { throw }; Start-Sleep -Milliseconds 900 }
    }
    Invoke-CheckedAdb -s $device pull $remotePng (Join-Path $OutputDirectory "$($profile.Name).png") | Out-Null
    Invoke-CheckedAdb -s $device pull $remoteXml (Join-Path $OutputDirectory "$($profile.Name).xml") | Out-Null
    Invoke-CheckedAdb -s $device shell rm $remotePng $remoteXml | Out-Null
    $capturedXml = [xml](Get-Content -LiteralPath (Join-Path $OutputDirectory "$($profile.Name).xml") -Raw)
    if (-not $capturedXml.SelectSingleNode("//node[@package='$package']")) {
      throw "La cattura $($profile.Name) non contiene l'app prevista."
    }
    $capturedPng = [IO.File]::ReadAllBytes((Join-Path $OutputDirectory "$($profile.Name).png"))
    if ($capturedPng.Length -lt 24 -or [BitConverter]::ToString($capturedPng, 0, 8) -ne '89-50-4E-47-0D-0A-1A-0A') {
      throw "Screenshot $($profile.Name) non valido."
    }
    $gfxInfo = (Invoke-CheckedAdb -s $device shell dumpsys gfxinfo $package) -join "`n"
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
  if ((Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $apkSha256) {
    throw 'APK modificato durante la verifica: ripetere la matrice.'
  }
  $manifest = [pscustomobject]@{
    Device = $device
    ApkSha256 = $apkSha256
    App = $App
    Package = $package
    CapturedAt = (Get-Date).ToString('o')
    Profiles = @($profiles.Name)
    FrameMetrics = $frameMetrics
    MaxJankyPercent = $MaxJankyPercent
  }
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
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'manifest.json') -Encoding utf8
}
finally {
  Restore-Display
  Invoke-CheckedAdb -s $device shell am force-stop $package | Out-Null
  Invoke-CheckedAdb -s $device shell am start -n $activity | Out-Null
}

#endregion
