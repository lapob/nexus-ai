<#
  @module scripts/verify-android-history
  @description Tests SQLite and Keystore on a connected Android device in a separate QA sandbox.
#>
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\development-paths.ps1')
$layout = Get-NexusDevelopmentLayout -ProjectRoot $projectRoot
$androidProject = Join-Path $projectRoot 'android\NexusRemote'
$buildEnvironment = Initialize-NexusAndroidBuildEnvironment -Layout $layout -AndroidProject $androidProject
$gradle = Resolve-NexusGradleExecutable -Layout $layout -Version '9.7.1'
if (-not $gradle) { throw 'Gradle 9.7.1 non disponibile.' }
$adb = Join-Path $buildEnvironment.SdkRoot 'platform-tools\adb.exe'
$devices = @(& $adb devices | Where-Object { $_ -match '\sdevice$' })
if ($devices.Count -ne 1) { throw 'Collega un solo dispositivo Android autorizzato.' }
$device = ($devices[0] -split '\s+')[0]
$window = (& $adb -s $device shell dumpsys window) -join "`n"
if ($window -match 'mDreamingLockscreen=true|mShowingLockscreen=true') { throw 'Sblocca il dispositivo prima dei test Activity; nessun tocco eseguito.' }
& $gradle.FullName -p $androidProject --console=plain assembleDebug assembleDebugAndroidTest
if ($LASTEXITCODE -ne 0) { throw 'Compilazione test Android fallita.' }
$window = (& $adb -s $device shell dumpsys window) -join "`n"
if ($window -match 'mDreamingLockscreen=true|mShowingLockscreen=true') { throw 'Il dispositivo si è bloccato durante la build: collaudo sospeso.' }
foreach ($apk in @('app\build\outputs\apk\debug\app-debug.apk', 'app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk')) {
    & $adb -s $device install --user 0 -r (Join-Path $androidProject $apk)
    if ($LASTEXITCODE -ne 0) { throw 'Installazione APK di test fallita.' }
}
$window = (& $adb -s $device shell dumpsys window) -join "`n"
if ($window -match 'mDreamingLockscreen=true|mShowingLockscreen=true') { throw 'Sblocca il dispositivo prima del collaudo.' }
$output = & $adb -s $device shell am instrument --user 0 -w -r -e class 'local.nexus.remote.LocalChatStoreTest,local.nexus.remote.ComposerContinuityTest' local.nexus.remote.qa.test/androidx.test.runner.AndroidJUnitRunner 2>&1
$exitCode = $LASTEXITCODE
$report = $output -join [Environment]::NewLine
$artifactDirectory = Join-Path $projectRoot 'qa-artifacts'
[IO.Directory]::CreateDirectory($artifactDirectory) | Out-Null
[IO.File]::WriteAllText((Join-Path $artifactDirectory 'android-history-device.log'), $report)
if ($exitCode -ne 0 -or $report -notmatch 'OK \(26 tests\)' -or $report -match 'FAILURES!!!|INSTRUMENTATION_FAILED') {
    Write-Output $report
    throw 'Test nativi della cronologia non superati.'
}
Write-Output 'PASS: 26 test SQLite/Keystore, readiness, risultati tipizzati, continuita Activity e autorizzazione assistente sul dispositivo, sandbox QA separata.'
