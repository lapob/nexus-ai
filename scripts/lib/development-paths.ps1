<#
  @module scripts/lib/development-paths
  @description Risolve runtime e toolchain developer rispetto al repository e al volume corrente.
#>

#region 01 - Layout del volume e normalizzazione

function Resolve-NexusConfiguredPath {
  param(
    [AllowEmptyString()][string]$Value,
    [Parameter(Mandatory)][string]$BasePath
  )

  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $expanded = [Environment]::ExpandEnvironmentVariables($Value.Trim())
  if (-not [IO.Path]::IsPathRooted($expanded)) { $expanded = Join-Path $BasePath $expanded }
  return [IO.Path]::GetFullPath($expanded)
}

function Get-NexusUniquePaths {
  param(
    [object[]]$Candidates,
    [Parameter(Mandatory)][string]$BasePath
  )

  $seen = @{}
  foreach ($candidate in $Candidates) {
    $resolved = Resolve-NexusConfiguredPath -Value ([string]$candidate) -BasePath $BasePath
    if (-not $resolved) { continue }
    $key = $resolved.TrimEnd('\').ToLowerInvariant()
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $resolved
  }
}

function Get-NexusDevelopmentLayout {
  param([string]$ProjectRoot = (Join-Path $PSScriptRoot '..\..'))

  $project = [IO.Path]::GetFullPath($ProjectRoot)
  $workspace = [IO.Path]::GetFullPath((Split-Path $project -Parent))
  $volume = [IO.Path]::GetPathRoot($project)
  if ([string]::IsNullOrWhiteSpace($volume)) { throw "Volume del progetto non rilevabile: $project" }

  $developerRoot = Resolve-NexusConfiguredPath -Value $env:NEXUS_DEVELOPER_HOME -BasePath $workspace
  if (-not $developerRoot) { $developerRoot = Join-Path $volume '[DEVELOPMENT]' }
  $toolchainsRoot = Resolve-NexusConfiguredPath -Value $env:NEXUS_TOOLCHAINS_HOME -BasePath $workspace
  if (-not $toolchainsRoot) { $toolchainsRoot = Join-Path $workspace '.toolchains' }

  [pscustomobject]@{
    ProjectRoot = $project
    WorkspaceRoot = $workspace
    VolumeRoot = $volume
    DeveloperRoot = [IO.Path]::GetFullPath($developerRoot)
    ToolchainsRoot = [IO.Path]::GetFullPath($toolchainsRoot)
    DataRoot = Join-Path $workspace '.nexus-data'
    RuntimeRoot = Join-Path $project '.nexus-runtime'
  }
}

#endregion
#region 02 - Toolchain Android

function Find-NexusExistingDirectory {
  param(
    [object[]]$Candidates,
    [Parameter(Mandatory)][string]$BasePath,
    [string[]]$RequiredRelativePaths = @()
  )

  foreach ($candidate in Get-NexusUniquePaths -Candidates $Candidates -BasePath $BasePath) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Container)) { continue }
    $missing = @($RequiredRelativePaths | Where-Object {
      -not (Test-Path -LiteralPath (Join-Path $candidate $_))
    })
    if ($missing.Count -eq 0) { return $candidate }
  }
  return $null
}

function Get-NexusAndroidSdkCandidates {
  param([Parameter(Mandatory)]$Layout)

  Get-NexusUniquePaths -BasePath $Layout.WorkspaceRoot -Candidates @(
    $env:NEXUS_ANDROID_SDK,
    (Join-Path $Layout.ToolchainsRoot 'android-sdk'),
    (Join-Path $Layout.DeveloperRoot 'Android\Sdk'),
    (Join-Path $Layout.DeveloperRoot 'Android SDK'),
    (Join-Path $Layout.DeveloperRoot 'Android Studio\sdk'),
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Android\Sdk' })
  )
}

function Resolve-NexusAndroidSdk {
  param(
    [Parameter(Mandatory)]$Layout,
    [string[]]$RequiredRelativePaths = @('build-tools')
  )

  Find-NexusExistingDirectory -Candidates @(Get-NexusAndroidSdkCandidates -Layout $Layout) `
    -BasePath $Layout.WorkspaceRoot -RequiredRelativePaths $RequiredRelativePaths
}

function Get-NexusGradleHomeCandidates {
  param([Parameter(Mandatory)]$Layout)

  Get-NexusUniquePaths -BasePath $Layout.WorkspaceRoot -Candidates @(
    $env:NEXUS_GRADLE_USER_HOME,
    (Join-Path $Layout.ToolchainsRoot 'gradle'),
    (Join-Path $Layout.DeveloperRoot 'Gradle'),
    $env:GRADLE_USER_HOME,
    $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE '.gradle' })
  )
}

function Resolve-NexusGradleExecutable {
  param(
    [Parameter(Mandatory)]$Layout,
    [Parameter(Mandatory)][string]$Version
  )

  # Gradle puo essere installato altrove, ma cache, daemon e trasformazioni
  # devono seguire il workspace portatile. In questo modo una cache globale
  # corrotta o appartenente a un altro PC non contamina la build NexusNXS.
  $gradleUserHome = Resolve-NexusConfiguredPath -Value $env:NEXUS_GRADLE_USER_HOME -BasePath $Layout.WorkspaceRoot
  if (-not $gradleUserHome) { $gradleUserHome = Join-Path $Layout.ToolchainsRoot 'gradle' }
  New-Item -ItemType Directory -Force -Path $gradleUserHome | Out-Null
  $env:GRADLE_USER_HOME = [IO.Path]::GetFullPath($gradleUserHome)

  $gradleHome = Resolve-NexusConfiguredPath -Value $env:NEXUS_GRADLE_HOME -BasePath $Layout.WorkspaceRoot
  if (-not $gradleHome) { $gradleHome = Resolve-NexusConfiguredPath -Value $env:GRADLE_HOME -BasePath $Layout.WorkspaceRoot }
  if ($gradleHome) {
    $direct = Join-Path $gradleHome 'bin\gradle.bat'
    if (Test-Path -LiteralPath $direct -PathType Leaf) { return Get-Item -LiteralPath $direct }
  }

  foreach ($gradleHomeCandidate in Get-NexusGradleHomeCandidates -Layout $Layout) {
    if (-not (Test-Path -LiteralPath $gradleHomeCandidate -PathType Container)) { continue }
    $distribution = Join-Path $gradleHomeCandidate "wrapper\dists\gradle-$Version-bin"
    $candidate = Get-ChildItem -LiteralPath $distribution -Filter 'gradle.bat' -Recurse -File -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($candidate) {
      return $candidate
    }
  }
  return $null
}

function Resolve-NexusJavaHome {
  param([Parameter(Mandatory)]$Layout)

  Find-NexusExistingDirectory -BasePath $Layout.WorkspaceRoot -RequiredRelativePaths @('bin\java.exe') -Candidates @(
    $env:NEXUS_JAVA_HOME,
    (Join-Path $Layout.ToolchainsRoot 'jdk'),
    (Join-Path $Layout.DeveloperRoot 'Android Studio\jbr'),
    $env:JAVA_HOME
  )
}

function Set-NexusAndroidLocalProperties {
  param(
    [Parameter(Mandatory)][string]$AndroidProject,
    [Parameter(Mandatory)][string]$SdkRoot
  )

  $escaped = $SdkRoot.Replace('\', '\\').Replace(':', '\:')
  $content = "# Generated for the current developer volume. Do not commit.`nsdk.dir=$escaped`n"
  $encoding = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText((Join-Path $AndroidProject 'local.properties'), $content, $encoding)
}

function Initialize-NexusAndroidBuildEnvironment {
  param(
    [Parameter(Mandatory)]$Layout,
    [Parameter(Mandatory)][string]$AndroidProject
  )

  $sdkRoot = Resolve-NexusAndroidSdk -Layout $Layout -RequiredRelativePaths @('build-tools')
  if (-not $sdkRoot) {
    $checked = (Get-NexusAndroidSdkCandidates -Layout $Layout) -join '; '
    throw "Android SDK non trovato. Imposta NEXUS_ANDROID_SDK oppure prepara una toolchain portatile. Percorsi controllati: $checked"
  }
  $env:ANDROID_HOME = $sdkRoot
  $env:ANDROID_SDK_ROOT = $sdkRoot

  $javaHome = Resolve-NexusJavaHome -Layout $Layout
  if ($javaHome) { $env:JAVA_HOME = $javaHome }
  Set-NexusAndroidLocalProperties -AndroidProject $AndroidProject -SdkRoot $sdkRoot

  [pscustomobject]@{ SdkRoot = $sdkRoot; JavaHome = $javaHome }
}

#endregion
#region 03 - Runtime e modelli Ollama

function Resolve-NexusOllamaModels {
  param([Parameter(Mandatory)]$Layout)

  Find-NexusExistingDirectory -BasePath $Layout.WorkspaceRoot -RequiredRelativePaths @('blobs', 'manifests') -Candidates @(
    $env:NEXUS_OLLAMA_MODELS,
    (Join-Path $Layout.WorkspaceRoot '.ollama'),
    (Join-Path $Layout.VolumeRoot '.ollama'),
    $env:OLLAMA_MODELS,
    $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE '.ollama\models' }),
    $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE '.ollama' })
  )
}

function Resolve-NexusOllamaExecutable {
  param([Parameter(Mandatory)]$Layout)

  foreach ($candidate in Get-NexusUniquePaths -BasePath $Layout.ProjectRoot -Candidates @(
    $env:NEXUS_OLLAMA_EXECUTABLE_PATH,
    (Join-Path $Layout.ProjectRoot 'vendor\ollama\windows-x64\ollama.exe'),
    (Join-Path $Layout.VolumeRoot 'NexusNXS-Runtime\ollama.exe')
  )) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }
  $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

#endregion
