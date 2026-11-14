<#
  @module scripts/open-server-console
  @description Apre NexusNXS Server Console in una finestra dedicata (Windows Terminal se presente).
  All'accesso (task "NexusNXS Console") parte ridotta a icona nella barra delle applicazioni, senza
  rubare il focus. Dal menu Start (-Normal) si apre in primo piano, oppure riporta davanti quella già aperta.
  Una sola istanza.
#>
param([switch]$Normal)

#region Apertura
$ErrorActionPreference = 'Stop'
$console = Join-Path $PSScriptRoot 'server-console.ps1'
$pwsh = (Get-Process -Id $PID).Path
$title = 'NexusNXS Server Console'

Add-Type -Namespace NexusNxs -Name ConsoleWindow -MemberDefinition @'
[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
public static IntPtr Find(string title) {
  IntPtr found = IntPtr.Zero;
  EnumWindows((hWnd, lParam) => {
    if (!IsWindowVisible(hWnd)) return true;
    var text = new System.Text.StringBuilder(256);
    GetWindowText(hWnd, text, text.Capacity);
    if (text.ToString() == title) { found = hWnd; return false; }
    return true;
  }, IntPtr.Zero);
  return found;
}
'@

function Wait-ConsoleWindow([int]$TimeoutMs) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    $handle = [NexusNxs.ConsoleWindow]::Find($title)
    if ($handle -ne [IntPtr]::Zero) { return $handle }
    Start-Sleep -Milliseconds 40
  } while ([DateTime]::UtcNow -lt $deadline)
  return [IntPtr]::Zero
}

# Le variabili del task portatile servono al server e al bridge, non alla console.
# NO_COLOR ereditato da strumenti o shell di automazione non vale per la finestra dedicata (resta -NoColor).
foreach ($name in @('NEXUS_DESKTOP_BRIDGE_ONLY', 'NEXUS_WINDOWS_NONINTERACTIVE', 'NO_COLOR')) {
  Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
}

# Già aperta: nessuna seconda finestra; dal menu Start la riporta in primo piano.
$existing = $null
if ([Threading.Mutex]::TryOpenExisting('Local\NexusNXS.ServerConsole', [ref]$existing)) {
  $existing.Dispose()
  if ($Normal) {
    $handle = Wait-ConsoleWindow 500
    if ($handle -ne [IntPtr]::Zero) {
      [void][NexusNxs.ConsoleWindow]::ShowWindow($handle, 9)  # SW_RESTORE
      [void][NexusNxs.ConsoleWindow]::SetForegroundWindow($handle)
    }
  }
  exit 0
}

$quote = { param($value) if ($value -match '\s') { '"{0}"' -f $value } else { $value } }
$arguments = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $console, '-Color')
$style = if ($Normal) { 'Normal' } else { 'Minimized' }
$terminal = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($terminal) {
  # Finestra nuova e dedicata, con titolo fisso e dimensione adatta alle due colonne.
  $wtArguments = @('-w', 'new', '--size', '132,44', 'new-tab', '--title', $title, '--suppressApplicationTitle', '--tabColor', '#0E111A', $pwsh) + $arguments
  Start-Process -FilePath $terminal.Source -ArgumentList ($wtArguments | ForEach-Object { & $quote $_ }) -WindowStyle $style
} else {
  Start-Process -FilePath $pwsh -ArgumentList ($arguments | ForEach-Object { & $quote $_ }) -WindowStyle $style
}

if (-not $Normal) {
  # Windows Terminal può ignorare lo stile richiesto quando un'istanza esistente apre la finestra:
  # la si riduce appena compare, senza attivarla (SW_SHOWMINNOACTIVE).
  # Terminal mostra la finestra anche a fine inizializzazione: si insiste finché resta ridotta 1,5 s.
  $handle = Wait-ConsoleWindow 15000
  if ($handle -ne [IntPtr]::Zero) {
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    $stableSince = $null
    while ([DateTime]::UtcNow -lt $deadline) {
      if ([NexusNxs.ConsoleWindow]::IsIconic($handle)) {
        if (-not $stableSince) { $stableSince = [DateTime]::UtcNow }
        if (([DateTime]::UtcNow - $stableSince).TotalMilliseconds -ge 1500) { break }
      } else {
        $stableSince = $null
        [void][NexusNxs.ConsoleWindow]::ShowWindow($handle, 7)  # SW_SHOWMINNOACTIVE
      }
      Start-Sleep -Milliseconds 60
    }
  }
}
#endregion
