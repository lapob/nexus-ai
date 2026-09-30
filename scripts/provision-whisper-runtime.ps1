<# @module scripts/provision-whisper-runtime
   Reconstruct the local CPU transcription runtime from pinned upstream assets. #>
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'config/whisper-runtime.json') -Raw | ConvertFrom-Json
$runtime = [IO.Path]::GetFullPath((Join-Path $projectRoot $manifest.runtimeDirectory))
if (-not $runtime.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime path outside project' }
$archive = Join-Path $runtime $manifest.archive.file
$model = Join-Path $runtime $manifest.model.file

#region 01 — Verified assets
function Get-AssetHash([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}
foreach ($asset in @($manifest.archive, $manifest.model)) {
  if ($asset.file -notmatch '^[a-zA-Z0-9.-]+$' -or $asset.sha256 -notmatch '^[a-f0-9]{64}$' -or
      $asset.url -notmatch '^https://(github\.com/ggml-org/whisper\.cpp/releases/download/v[0-9.]+/|huggingface\.co/ggerganov/whisper\.cpp/resolve/[a-f0-9]{40}/)') {
    throw 'Invalid transcription asset manifest'
  }
  $target = Join-Path $runtime $asset.file
  if (-not (Test-Path -LiteralPath $target)) {
    if ($CheckOnly) { throw "Missing transcription asset: $($asset.file)" }
    [IO.Directory]::CreateDirectory($runtime) | Out-Null
    $partial = "$target.partial"
    & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 900 --output $partial $asset.url
    if ($LASTEXITCODE -ne 0) { throw 'Transcription asset download failed' }
    if ((Get-Item -LiteralPath $partial).Length -ne $asset.bytes -or
        (Get-AssetHash $partial) -ne $asset.sha256) { throw 'Downloaded transcription asset integrity mismatch' }
    Move-Item -LiteralPath $partial -Destination $target
  }
  if ((Get-Item -LiteralPath $target).Length -ne $asset.bytes -or
      (Get-AssetHash $target) -ne $asset.sha256) { throw "Transcription integrity mismatch: $($asset.file)" }
}
#endregion

#region 02 — Minimal runtime and exact binary comparison
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
  $entries = @($zip.Entries | Where-Object { $_.FullName -match '^Release/(whisper-(cli|stream)\.exe|whisper\.dll|SDL2\.dll|ggml(?:-base|-cpu-[a-z0-9]+)?\.dll)$' })
  foreach ($required in @('whisper-cli.exe', 'whisper-stream.exe', 'whisper.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu-x64.dll', 'SDL2.dll')) {
    if (-not ($entries | Where-Object Name -eq $required)) { throw "Missing archive runtime entry: $required" }
  }
  foreach ($entry in $entries) {
    $target = Join-Path $runtime $entry.Name
    if (-not (Test-Path -LiteralPath $target)) {
      if ($CheckOnly) { throw "Missing runtime binary: $($entry.Name)" }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
    $stream = $entry.Open(); $sha = [Security.Cryptography.SHA256]::Create()
    try { $expected = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ((Get-AssetHash $target) -ne $expected) { throw "Runtime binary integrity mismatch: $($entry.Name)" }
  }
} finally { $zip.Dispose() }
try {
  $ErrorActionPreference = 'Continue' # Native loader diagnostics are written to stderr.
  & (Join-Path $runtime 'whisper-cli.exe') --help 2>&1 | Out-Null
} finally { $ErrorActionPreference = 'Stop' }
if ($LASTEXITCODE -ne 0) { throw 'Transcription runtime failed to load' }
Write-Output "Whisper $($manifest.version) CPU runtime and multilingual base model verified."
#endregion
