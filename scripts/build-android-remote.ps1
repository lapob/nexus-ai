<#
  @module scripts/build-android-remote
  @description Compila, firma, verifica e pubblica NexusNXS per Android.
#>
param(
    [switch]$PublicRelease
)
$ErrorActionPreference = "Stop"

#region Configurazione ambiente e credenziali

$projectRoot = Split-Path -Parent $PSScriptRoot
$developmentPaths = Join-Path $PSScriptRoot 'lib\development-paths.ps1'
. $developmentPaths
$developmentLayout = Get-NexusDevelopmentLayout -ProjectRoot $projectRoot
$androidProject = Join-Path $projectRoot "android\NexusRemote"
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
if ($PublicRelease -and -not $signedRelease) {
    throw "Release pubblica bloccata: configura NEXUS_ANDROID_KEYSTORE, NEXUS_ANDROID_STORE_PASSWORD, NEXUS_ANDROID_KEY_ALIAS e NEXUS_ANDROID_KEY_PASSWORD. Una firma Debug non può essere pubblicata."
}
if ($PublicRelease) {
    $publicEndpoint = $null
    if (-not [Uri]::TryCreate($env:NEXUS_URL, [UriKind]::Absolute, [ref]$publicEndpoint) -or
        $publicEndpoint.Scheme -ne 'https' -or -not $publicEndpoint.Host -or
        $publicEndpoint.UserInfo -or $publicEndpoint.Query -or $publicEndpoint.Fragment) {
        throw "Release pubblica bloccata: NEXUS_URL deve essere un'origine HTTPS valida."
    }
}
# NexusNXS per Android e un client pubblico: anche la Preview condivisibile deve
# contenere soltanto l'origine pubblica. Gli endpoint Tailscale appartengono alla
# Console privata e non devono comparire nel bytecode di questa app.
$env:NEXUS_LAN_URL = ""
$env:NEXUS_FALLBACK_URL = ""

#endregion
#region Compilazione e raccolta artefatti

# Preview conserva ottimizzazione, shrinking e Baseline Profile della release, ma
# non produce mai un bundle che possa essere confuso con un artefatto Play firmato.
$variant = if ($signedRelease) { "Release" } else { "Preview" }
$gradleTasks = @("assemble$variant", "lint$variant")
if ($signedRelease) { $gradleTasks += "bundle$variant" }
& $gradle.FullName -p $androidProject --console=plain $gradleTasks
if ($LASTEXITCODE -ne 0) { throw "Compilazione Android non riuscita." }

$variantFolder = $variant.ToLowerInvariant()
$sourceApk = Join-Path $androidProject "app\build\outputs\apk\$variantFolder\app-$variantFolder.apk"
$outputDir = Join-Path $projectRoot "release-android"
$gradleConfig = Get-Content -LiteralPath (Join-Path $androidProject "app\build.gradle") -Raw
$version = [regex]::Match($gradleConfig, 'versionName\s*(?:=\s*)?"([^"]+)"').Groups[1].Value
if (-not $version) { throw "Versione NexusNXS per Android non rilevata." }
$outputApk = Join-Path $outputDir "NexusNXS-Android-$version.apk"
$stableApk = Join-Path $outputDir "NexusNXS-Android.apk"
$outputBundle = Join-Path $outputDir "NexusNXS-Android-$version.aab"
$stableBundle = Join-Path $outputDir "NexusNXS-Android.aab"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Copy-Item -LiteralPath $sourceApk -Destination $outputApk -Force
Copy-Item -LiteralPath $sourceApk -Destination $stableApk -Force
if ($signedRelease) {
    $sourceBundle = Join-Path $androidProject "app\build\outputs\bundle\$variantFolder\app-$variantFolder.aab"
    Copy-Item -LiteralPath $sourceBundle -Destination $outputBundle -Force
    Copy-Item -LiteralPath $sourceBundle -Destination $stableBundle -Force
} else {
    Remove-Item -LiteralPath $outputBundle, $stableBundle -Force -ErrorAction SilentlyContinue
}

#endregion
#region Verifica firma e impronta

$apksigner = [IO.Directory]::EnumerateFiles(
    (Join-Path $sdkRoot "build-tools"),
    "apksigner.bat",
    [IO.SearchOption]::AllDirectories
) | Sort-Object -Descending | Select-Object -First 1
if (-not $apksigner) { throw "apksigner non trovato nell'Android SDK." }
$signatureReport = (& $apksigner verify --verbose --print-certs $outputApk | Out-String)
Write-Host $signatureReport.TrimEnd()
if ($LASTEXITCODE -ne 0) { throw "Firma APK non valida." }
if ($PublicRelease -and $signatureReport -match 'CN=Android Debug') {
    throw "Release pubblica bloccata: l'APK usa ancora il certificato Android Debug."
}

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
if ($signedRelease) { Write-Host "Bundle Play firmato: $outputBundle" }
else { Write-Host "Build Preview locale: nessun bundle Play generato." }
Write-Host "SHA256: $hash"

#endregion
