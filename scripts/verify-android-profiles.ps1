<# @module scripts/verify-android-profiles
   Verify the exact installed APK's baseline profile, then measure ART compilation without clearing data. #>
param(
  [Parameter(Mandatory)][ValidateSet('Control')][string]$App,
  [Parameter(Mandatory)][string]$ApkPath,
  [switch]$Apply,
  [ValidateRange(3,10)][int]$Iterations = 3
)
$ErrorActionPreference = 'Stop'
#region 01 — Exact APK and device boundary
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'lib/development-paths.ps1')
$layout = Get-NexusDevelopmentLayout -ProjectRoot $projectRoot
$sdk = Resolve-NexusAndroidSdk -Layout $layout -RequiredRelativePaths @('platform-tools\adb.exe')
if (-not $sdk) { throw 'ADB non disponibile.' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
function Invoke-ProfileAdb {
  $info = [Diagnostics.ProcessStartInfo]::new($adb)
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  foreach ($argument in $args) { $info.ArgumentList.Add([string]$argument) }
  $process = [Diagnostics.Process]::Start($info)
  try {
    $output = $process.StandardOutput.ReadToEndAsync(); $errors = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'ADB ha superato il limite: nessuna prova dichiarata riuscita.' }
    $text = $output.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw "ADB non ha completato la prova ($($process.ExitCode))." }
    return $text
  } finally { $process.Dispose() }
}
$devices = @((Invoke-ProfileAdb devices) -split "`n" | Where-Object { $_ -match '\sdevice\s*$' })
if ($devices.Count -ne 1) { throw 'Collega un solo dispositivo Android autorizzato.' }
$serial = ($devices[0] -split '\s+')[0]
$package = 'local.nexus.console'
$activity = '.NativeMainActivity'
$file = (Get-Item -LiteralPath $ApkPath).FullName
$digest = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
$installed = (Invoke-ProfileAdb -s $serial shell pm path --user 0 $package).Trim() -replace '^package:', ''
if ($installed -match "`n|`r" -or -not $installed.StartsWith('/data/app/')) { throw 'Percorso APK installato non valido.' }
$installedHash = ((Invoke-ProfileAdb -s $serial shell sha256sum $installed) -split '\s+')[0]
if ($installedHash -ne $digest) { throw 'APK installato diverso dalla build: confronto rifiutato.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($file)
try {
  $profile = $zip.Entries | Where-Object FullName -eq 'assets/dexopt/baseline.prof'
  if (-not $profile -or $profile.Length -lt 16) { throw 'Baseline Profile assente o vuoto nel pacchetto APK.' }
  $profileBytes = $profile.Length
} finally { $zip.Dispose() }
#endregion

#region 02 — Non-destructive profile installation and measured cold launches
$report = [ordered]@{ app = $App; apkSha256 = $digest; profileBytes = $profileBytes; applied = $false }
if ($Apply) {
  $window = Invoke-ProfileAdb -s $serial shell dumpsys window
  if ($window -match 'mDreamingLockscreen=true|mShowingLockscreen=true') { throw 'Sblocca il dispositivo prima del collaudo.' }
  $before = @()
  foreach ($iteration in 1..$Iterations) {
    Invoke-ProfileAdb -s $serial shell am force-stop --user 0 $package | Out-Null
    $launch = Invoke-ProfileAdb -s $serial shell am start --user 0 -W -n "$package/$activity"
    if ($launch -notmatch 'TotalTime:\s*(\d+)') { throw 'Misura avvio non disponibile.' }
    $before += [int]$Matches[1]
  }
  $result = Invoke-ProfileAdb -s $serial shell am broadcast --user 0 -a androidx.profileinstaller.action.INSTALL_PROFILE -n "$package/androidx.profileinstaller.ProfileInstallReceiver"
  if ($result -notmatch 'result=[12]\b') { throw 'Installazione del profilo non confermata; nessun fallback alla compilazione completa.' }
  $compileArguments = @('-s', $serial, 'shell', 'cmd', 'package', 'compile', '-m', 'speed-profile', '-f')
  # Android16 can decline merging a small newly installed profile below its
  # normal background threshold. The documented flag makes this QA comparison
  # use that profile; it never substitutes full, non-profile-guided compilation.
  $compileHelp = Invoke-ProfileAdb -s $serial shell cmd package help
  if ($compileHelp -match '--force-merge-profile') { $compileArguments += '--force-merge-profile' }
  $compileArguments += $package
  $compile = Invoke-ProfileAdb @compileArguments
  if ($compile -notmatch 'Success') { throw 'ART non ha confermato la compilazione con profilo.' }
  $state = Invoke-ProfileAdb -s $serial shell dumpsys package $package
  if ($state -notmatch '\[status=speed-profile\]') { throw 'ART non risulta speed-profile; non dichiarare ottimizzazione applicata.' }
  $after = @()
  foreach ($iteration in 1..$Iterations) {
    Invoke-ProfileAdb -s $serial shell am force-stop --user 0 $package | Out-Null
    $launch = Invoke-ProfileAdb -s $serial shell am start --user 0 -W -n "$package/$activity"
    if ($launch -notmatch 'TotalTime:\s*(\d+)') { throw 'Misura avvio non disponibile.' }
    $after += [int]$Matches[1]
  }
  $report.applied = $true
  $report.beforeMs = $before; $report.afterMs = $after
  $report.beforeMedianMs = ($before | Sort-Object)[[int][math]::Floor($before.Count / 2)]
  $report.afterMedianMs = ($after | Sort-Object)[[int][math]::Floor($after.Count / 2)]
  $report.compilerFilter = 'speed-profile'
  $report.limit = 'Small device sample; no p95, cache-controlled or universal performance claim.'
}
$target = Join-Path $projectRoot "qa-artifacts/android-$($App.ToLowerInvariant())-profiles.json"
[IO.File]::WriteAllText($target, ($report | ConvertTo-Json -Depth 5))
$report | ConvertTo-Json -Depth 5
#endregion
