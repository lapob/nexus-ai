<#
  @module scripts/build-android-console
  @description Compila, verifica e pubblica il client privato NexusNXS Control.
#>
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$developmentPaths = Join-Path $PSScriptRoot 'lib\development-paths.ps1'
. $developmentPaths
$developmentLayout = Get-NexusDevelopmentLayout -ProjectRoot $projectRoot
$androidProject = Join-Path $projectRoot "android\NexusConsole"
$endpointConfig = Join-Path $projectRoot "config\android-endpoints.local.properties"
if (Test-Path -LiteralPath $endpointConfig) {
    foreach ($line in Get-Content -LiteralPath $endpointConfig) {
        if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$' -and -not [Environment]::GetEnvironmentVariable($Matches[1], 'Process')) {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
        }
    }
}
$androidEnvironment = Initialize-NexusAndroidBuildEnvironment -Layout $developmentLayout -AndroidProject $androidProject
$sdkRoot = $androidEnvironment.SdkRoot
$gradle = Resolve-NexusGradleExecutable -Layout $developmentLayout -Version '9.7.1'
if (-not $gradle) {
    throw 'Gradle 9.7.1 non trovato. Imposta NEXUS_GRADLE_HOME/NEXUS_GRADLE_USER_HOME oppure prepara la toolchain sul volume del progetto.'
}
$signedRelease = $env:NEXUS_ANDROID_KEYSTORE -and $env:NEXUS_ANDROID_STORE_PASSWORD -and $env:NEXUS_ANDROID_KEY_ALIAS -and $env:NEXUS_ANDROID_KEY_PASSWORD
$variant = if ($signedRelease) { "Release" } else { "Preview" }
& $gradle.FullName -p $androidProject --offline --console=plain "assemble$variant" "lint$variant"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Dipendenza non presente nella cache: sincronizzazione sicura dai repository configurati..."
    & $gradle.FullName -p $androidProject --console=plain "assemble$variant" "lint$variant"
}
if ($LASTEXITCODE -ne 0) { throw "Compilazione NexusNXS Console non riuscita." }

$variantFolder = $variant.ToLowerInvariant()
$sourceApk = Join-Path $androidProject "app\build\outputs\apk\$variantFolder\app-$variantFolder.apk"
$outputDir = Join-Path $projectRoot "release-android"
$gradleConfig = Get-Content -LiteralPath (Join-Path $androidProject "app\build.gradle") -Raw
$version = [regex]::Match($gradleConfig, 'versionName\s+"([^"]+)"').Groups[1].Value
if (-not $version) { throw "Versione NexusNXS Control non rilevata." }
$outputApk = Join-Path $outputDir "NexusNXS-Control-$version.apk"
$stableApk = Join-Path $outputDir "NexusNXS-Control.apk"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Copy-Item -LiteralPath $sourceApk -Destination $outputApk -Force
Copy-Item -LiteralPath $sourceApk -Destination $stableApk -Force

$apksigner = [IO.Directory]::EnumerateFiles(
    (Join-Path $sdkRoot "build-tools"),
    "apksigner.bat",
    [IO.SearchOption]::AllDirectories
) | Sort-Object -Descending | Select-Object -First 1
if (-not $apksigner) { throw "apksigner non trovato nell'Android SDK." }
& $apksigner verify --verbose --print-certs $outputApk
if ($LASTEXITCODE -ne 0) { throw "Firma APK NexusNXS Console non valida." }

$stream = [System.IO.File]::OpenRead($outputApk)
try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "")
} finally {
    if ($sha256) { $sha256.Dispose() }
    $stream.Dispose()
}
Write-Host "APK pronto: $outputApk"
Write-Host "Alias stabile: $stableApk"
Write-Host "SHA256: $hash"
