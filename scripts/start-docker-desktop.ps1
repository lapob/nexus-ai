<#
  @module scripts/start-docker-desktop
  @description Avvio al login con lo stesso recupero socket e health check della ricerca locale.
#>
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$logs = Join-Path $workspaceRoot '.nexus-data\logs'
[IO.Directory]::CreateDirectory($logs) | Out-Null
$log = Join-Path $logs 'docker-startup.log'
$mutex = [Threading.Mutex]::new($false, 'Local\NexusNXSDockerStartup')
$owned = $false
try {
  try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
  if (-not $owned) { exit 0 }
  Add-Content -LiteralPath $log -Value "[$([DateTime]::UtcNow.ToString('o'))] Startup requested."
  # Questo processo figlio conserva un codice di uscita verificabile e non apre
  # finestre console. Usa la stessa procedura manuale, incluso il recupero socket.
  $engine = Join-Path $PSHOME 'powershell.exe'
  if (-not (Test-Path -LiteralPath $engine)) { $engine = Join-Path $PSHOME 'pwsh.exe' }
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $engine
  $start.Arguments = '-NoProfile -NonInteractive -File "' + (Join-Path $PSScriptRoot 'manage-self-hosted-search.ps1') + '" -Action start'
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $child = [Diagnostics.Process]::Start($start)
  $output = $child.StandardOutput.ReadToEndAsync()
  $errors = $child.StandardError.ReadToEndAsync()
  $child.WaitForExit()
  [IO.File]::AppendAllText($log, $output.GetAwaiter().GetResult() + $errors.GetAwaiter().GetResult())
  $exitCode = $child.ExitCode
  $child.Dispose()
  if ($exitCode -ne 0) { throw "Docker/Search startup failed (exit $exitCode). See $log" }
  Add-Content -LiteralPath $log -Value "[$([DateTime]::UtcNow.ToString('o'))] Docker and search healthy."
} catch {
  Add-Content -LiteralPath $log -Value "[$([DateTime]::UtcNow.ToString('o'))] FAILED: $($_.Exception.Message)"
  throw
} finally {
  if ($owned) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
