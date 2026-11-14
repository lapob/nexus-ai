<#
  @module scripts/open-server-console
  @description Apre NexusNXS Server Console in una finestra dedicata (Windows Terminal se presente).
  Usato dal task "NexusNXS Console" all'accesso e dal collegamento nel menu Start. Una sola istanza.
#>
#region Apertura
$ErrorActionPreference = 'Stop'
$console = Join-Path $PSScriptRoot 'server-console.ps1'
$pwsh = (Get-Process -Id $PID).Path

# Le variabili del task portatile servono al server e al bridge, non alla console.
foreach ($name in @('NEXUS_DESKTOP_BRIDGE_ONLY', 'NEXUS_WINDOWS_NONINTERACTIVE')) {
  Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
}

# Già aperta: nessuna seconda finestra.
$existing = $null
if ([Threading.Mutex]::TryOpenExisting('Local\NexusNXS.ServerConsole', [ref]$existing)) {
  $existing.Dispose()
  exit 0
}

$arguments = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $console)
$terminal = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($terminal) {
  # Finestra nuova e dedicata, con titolo fisso e dimensione adatta alle due colonne.
  $wtArguments = @('-w', 'new', '--size', '132,44', 'new-tab', '--title', 'NexusNXS Server Console', '--suppressApplicationTitle', $pwsh) + $arguments
  Start-Process -FilePath $terminal.Source -ArgumentList ($wtArguments | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } })
} else {
  Start-Process -FilePath $pwsh -ArgumentList ($arguments | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }) -WindowStyle Normal
}
#endregion
