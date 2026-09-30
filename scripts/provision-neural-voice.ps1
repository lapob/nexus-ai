<#
  @module scripts/provision-neural-voice
  Reconstructs the optional local voice runtime from pinned sources.
#>
param([string]$InstallerPython = 'python', [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'config/neural-voice-runtime.json') -Raw | ConvertFrom-Json
$pythonManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'config/python-runtime.json') -Raw | ConvertFrom-Json
$runtime = Join-Path $projectRoot $manifest.runtimeDirectory
$python = Join-Path $projectRoot ($pythonManifest.runtimeDirectory + '/python.exe')
$packages = Join-Path $runtime '.venv/Lib/site-packages'
$models = Join-Path $runtime 'models'
$worker = Join-Path $projectRoot $manifest.worker

#region 01 — Provenance and paths
foreach ($target in @($runtime, $python, $worker)) {
  if (-not [IO.Path]::GetFullPath($target).StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Voice manifest path outside project'
  }
}
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $worker)) {
  throw 'Provision the approved Python runtime and restore the tracked voice source first.'
}
& node (Join-Path $PSScriptRoot 'check-python-runtime.js') --require-installed
if ($LASTEXITCODE -ne 0) { throw 'Python provenance check failed' }
foreach ($asset in $manifest.assets) {
  if ($asset.file -notmatch '^[a-zA-Z0-9.-]+$' -or $asset.sha256 -notmatch '^[a-f0-9]{64}$' -or
      -not $asset.url.StartsWith('https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/')) {
    throw 'Invalid voice asset manifest'
  }
  $file = Join-Path $models $asset.file
  if (-not (Test-Path -LiteralPath $file)) {
    if ($CheckOnly) { throw "Missing voice asset: $($asset.file)" }
    [IO.Directory]::CreateDirectory($models) | Out-Null
    & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 900 --output $file $asset.url
    if ($LASTEXITCODE -ne 0) { throw 'Voice asset download failed' }
  }
  if ((Get-Item -LiteralPath $file).Length -ne $asset.bytes -or
      (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256) {
    throw "Voice asset integrity check failed: $($asset.file)"
  }
}
#endregion
#region 02 — Pinned dependencies and import probe
if (-not $CheckOnly) {
  $cache = Join-Path (Split-Path $projectRoot -Parent) '.toolchains/cache/pip'
  & $InstallerPython -m pip --python $python install --disable-pip-version-check --only-binary=:all: --no-deps --cache-dir $cache --target $packages @($manifest.dependencies)
  if ($LASTEXITCODE -ne 0) { throw 'Pinned voice dependency installation failed' }
}
$probe = @'
import importlib.metadata as metadata, json, pathlib, sys
packages, manifest_path = sys.argv[1:]
sys.path.insert(0, packages)
manifest = json.loads(pathlib.Path(manifest_path).read_text(encoding="utf-8"))
for pin in manifest["dependencies"]:
    name, expected = pin.split("==")
    if metadata.version(name) != expected:
        raise RuntimeError("Voice dependency version mismatch: " + name)
import numpy, onnxruntime, kokoro_onnx, soundfile
print("Pinned voice dependencies and imports verified")
'@
& $python -I -c $probe $packages (Join-Path $projectRoot 'config/neural-voice-runtime.json')
if ($LASTEXITCODE -ne 0) { throw 'Voice runtime import probe failed' }
#endregion
