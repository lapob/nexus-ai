<#
  @module scripts/server-console
  @description NexusNXS Server Console: stato approfondito in tempo reale e comandi sicuri per il server.
  La console è solo un'interfaccia. Il server è un servizio separato (task "NexusNXS Server", avvio
  all'accensione): chiudere questa finestra non lo arresta mai. Ogni comando passa dal gestore
  coordinato manage-headless-server-task.ps1; spegnimento e riavvio del PC chiedono una parola
  di conferma scritta e fermano prima il server in modo pulito.
#>
param(
  [ValidateRange(1, 30)][int]$RefreshSeconds = 2,
  # Un solo fotogramma su stdout, senza tasti: diagnostica rapida e prove.
  [switch]$Once,
  [switch]$NoColor,
  # La finestra dedicata è sempre a colori: Windows Terminal può ereditare NO_COLOR dal processo che l'ha avviato.
  [switch]$Color,
  # Salta i controlli verso Internet (prove senza rete).
  [switch]$Offline,
  # Non chiedere l'avvio del server all'apertura.
  [switch]$NoAutoStart,
  [string]$DataRoot,
  [int]$PrivatePort = 32145,
  [int]$PublicPort = 32147,
  [string]$ManagerPath,
  [string]$PowerExecutable = (Join-Path $env:SystemRoot 'System32\shutdown.exe'),
  # Prove: tasti e testi simulati, per esempio 'p', '1', 'text:SPEGNI'. Mai finestre né azioni reali.
  [string[]]$ScriptedInput
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Off
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $DataRoot) { $DataRoot = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data' }
if (-not $ManagerPath) { $ManagerPath = Join-Path $PSScriptRoot 'manage-headless-server-task.ps1' }
$pwshPath = (Get-Process -Id $PID).Path
$scripted = $null -ne $ScriptedInput
$interactive = -not $Once -and -not $scripted
$paths = @{
  log = Join-Path $DataRoot 'logs\nexus.log'
  watchdogLog = Join-Path $DataRoot 'logs\watchdog.log'
  watchdogState = Join-Path $DataRoot 'metrics\watchdog-state.json'
  lock = Join-Path $DataRoot 'headless-server.lock'
  maintenance = Join-Path $DataRoot 'maintenance.flag'
  ownerStop = Join-Path $DataRoot 'server-stopped.flag'
  backups = Join-Path $DataRoot 'backups'
}
$italian = [Globalization.CultureInfo]::GetCultureInfo('it-IT')
$version = try { (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version } catch { '-' }

#region 01 — Tema e impaginazione

$useColor = -not $NoColor -and ($Color -or -not $env:NO_COLOR)
function New-Tone([string]$Hex) {
  if (-not $useColor) { return '' }
  $r = [Convert]::ToInt32($Hex.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($Hex.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($Hex.Substring(4, 2), 16)
  return "`e[38;2;$r;$g;${b}m"
}
# Spazio profondo, testo freddo, accenti Nexus (blu ghiaccio, viola, ciano) e stati morbidi.
$palette = @{
  bg = '090B11'; card = '0E111A'; border = '232A3B'; chip = '161B28'
  text = 'E8EAF1'; muted = '8E95A8'; dim = '4F566A'; accent = '8DB6FF'; violet = 'B9A2FF'; cyan = '6EE7F9'
  ok = '52D7A0'; warn = 'F4C46E'; err = 'FF7272'
}
$T = @{
  bold = $(if ($useColor) { "`e[1m" } else { '' }); reset = $(if ($useColor) { "`e[0m" } else { '' })
}
foreach ($name in $palette.Keys) { $T[$name] = New-Tone $palette[$name] }

function Get-MixedHex([string]$From, [string]$To, [double]$Amount) {
  # Letterali 0.0/1.0: con 0 e 1 interi PowerShell sceglie Max(int, int) e arrotonda la frazione.
  $Amount = [Math]::Min(1.0, [Math]::Max(0.0, $Amount))
  $channels = for ($i = 0; $i -lt 6; $i += 2) {
    $a = [Convert]::ToInt32($From.Substring($i, 2), 16)
    $b = [Convert]::ToInt32($To.Substring($i, 2), 16)
    [int][Math]::Round($a + ($b - $a) * $Amount)
  }
  return '{0:X2}{1:X2}{2:X2}' -f $channels[0], $channels[1], $channels[2]
}

$toneCache = @{}
function Get-MixedTone([string]$From, [string]$To, [double]$Amount) {
  # Sfumature quantizzate a 1/48 e memorizzate: animazioni e grafici senza ricalcoli per carattere.
  $step = [int][Math]::Round([Math]::Min(1.0, [Math]::Max(0.0, $Amount)) * 48)
  $key = "$From$To$step"
  $tone = $toneCache[$key]
  if ($null -eq $tone) { $tone = New-Tone (Get-MixedHex $From $To ($step / 48)); $toneCache[$key] = $tone }
  return $tone
}

function New-Back([string]$Hex) {
  if (-not $useColor) { return '' }
  $r = [Convert]::ToInt32($Hex.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($Hex.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($Hex.Substring(4, 2), 16)
  return "`e[48;2;$r;$g;${b}m"
}

function Get-Gradient([string]$Text, [string]$From, [string]$To) {
  # Sfumatura carattere per carattere, come il marchio Nexus.
  if (-not $useColor -or $Text.Length -lt 2) { return V $Text 'text' }
  $builder = [Text.StringBuilder]::new()
  for ($i = 0; $i -lt $Text.Length; $i++) {
    [void]$builder.Append((Get-MixedTone $From $To ($i / ($Text.Length - 1)))).Append($Text[$i])
  }
  return $builder.ToString() + $T.reset
}

function Format-Chip([string]$Text, [string]$Tone) {
  # Etichetta a pillola: fondo tinto dal colore dello stato, testo pieno.
  if (-not $useColor) { return "[$Text]" }
  return (New-Back (Get-MixedHex $palette[$Tone] $palette.bg 0.8)) + $T.bold + $T[$Tone] + " $Text " + $T.reset
}

function Format-Key([string]$Key) {
  if (-not $useColor) { return "[$Key]" }
  return (New-Back $palette.chip) + $T.accent + $T.bold + " $Key " + $T.reset
}

function Format-Bar([double]$Fraction, [int]$Width, [string]$Tone) {
  # Traccia sottile: parte piena sfumata verso il colore dello stato, resto sul colore del bordo.
  $Fraction = [Math]::Min(1.0, [Math]::Max(0.0, $Fraction))
  $filled = [int][Math]::Round($Fraction * $Width)
  if (-not $useColor) { return ('=' * $filled) + ('-' * ($Width - $filled)) }
  $builder = [Text.StringBuilder]::new()
  for ($i = 0; $i -lt $filled; $i++) {
    $amount = if ($filled -gt 1) { $i / ($filled - 1) } else { 1 }
    [void]$builder.Append((Get-MixedTone (Get-MixedHex $palette[$Tone] $palette.bg 0.55) $palette[$Tone] $amount)).Append('━')
  }
  [void]$builder.Append($T.border).Append('─' * ($Width - $filled)).Append($T.reset)
  return $builder.ToString()
}

$sparkGlyphs = '▁▂▃▄▅▆▇█'
function Format-Spark([object[]]$Values, [int]$Width, [string]$Tone, [double]$Max = 0) {
  # Mini grafico dell'andamento recente; i valori più vecchi sfumano verso il fondo.
  $series = @($Values | Select-Object -Last $Width)
  if (-not $series.Count) { return V ('▁' * $Width) 'border' }
  $top = if ($Max -gt 0) { $Max } else { [Math]::Max(1.0, [double]($series | Measure-Object -Maximum).Maximum) }
  $builder = [Text.StringBuilder]::new()
  if ($series.Count -lt $Width) { [void]$builder.Append($T.border).Append('▁' * ($Width - $series.Count)) }
  for ($i = 0; $i -lt $series.Count; $i++) {
    $level = [int][Math]::Round([Math]::Min(1.0, [Math]::Max(0.0, [double]$series[$i] / $top)) * 7)
    $fade = if ($series.Count -gt 1) { 0.6 * (1 - $i / ($series.Count - 1)) } else { 0 }
    if ($useColor) { [void]$builder.Append((Get-MixedTone $palette[$Tone] $palette.dim $fade)) }
    [void]$builder.Append($sparkGlyphs[$level])
  }
  return $builder.ToString() + $T.reset
}

$history = @{}
function Add-History([string]$Name, $Value) {
  if ($null -eq $Value) { return }
  if (-not $history.ContainsKey($Name)) { $history[$Name] = [Collections.Generic.List[double]]::new() }
  $history[$Name].Add([double]$Value)
  if ($history[$Name].Count -gt 48) { $history[$Name].RemoveAt(0) }
}
function Get-History([string]$Name) { if ($history.ContainsKey($Name)) { return , $history[$Name].ToArray() } return , @() }
$ansi = [regex]'\x1b\[[0-9;?]*[ -/]*[@-~]'

function V([object]$Text, [string]$Tone = 'text') { return "$($T[$Tone])$Text$($T.reset)" }
function Get-Visible([string]$Line) { return $ansi.Replace($Line, '') }

function Format-Fit([string]$Line, [int]$Width, [switch]$Pad) {
  # Tronca alla larghezza visibile senza spezzare le sequenze di colore; con -Pad riempie.
  $visible = (Get-Visible $Line).Length
  if ($visible -le $Width) {
    if ($Pad) { return $Line + (' ' * ($Width - $visible)) }
    return $Line
  }
  $builder = [Text.StringBuilder]::new()
  $count = 0
  $index = 0
  $limit = [Math]::Max(0, $Width - 1)
  while ($index -lt $Line.Length -and $count -lt $limit) {
    $match = $ansi.Match($Line, $index)
    if ($match.Success -and $match.Index -eq $index) {
      [void]$builder.Append($match.Value)
      $index += $match.Length
      continue
    }
    [void]$builder.Append($Line[$index])
    $count += 1
    $index += 1
  }
  return $builder.ToString() + '…' + $T.reset
}

function Format-Span([TimeSpan]$Span) {
  if ($Span.TotalSeconds -lt 60) { return '{0} s' -f [int][Math]::Max(0, $Span.TotalSeconds) }
  if ($Span.TotalMinutes -lt 60) { return '{0} min' -f [int][Math]::Floor($Span.TotalMinutes) }
  if ($Span.TotalHours -lt 24) { return '{0} h {1} min' -f [int][Math]::Floor($Span.TotalHours), $Span.Minutes }
  return '{0} g {1} h' -f [int][Math]::Floor($Span.TotalDays), $Span.Hours
}

function Format-Bytes([double]$Bytes) {
  if ($Bytes -ge 1TB) { return '{0:N1} TB' -f ($Bytes / 1TB) }
  if ($Bytes -ge 1GB) { return '{0:N1} GB' -f ($Bytes / 1GB) }
  if ($Bytes -ge 1MB) { return '{0:N0} MB' -f ($Bytes / 1MB) }
  return '{0:N0} KB' -f ($Bytes / 1KB)
}

function Format-Clock([DateTime]$Local) {
  if ($Local.Date -eq (Get-Date).Date) { return $Local.ToString('HH:mm:ss') }
  return $Local.ToString('dd/MM HH:mm', $italian)
}

#endregion

#region 02 — Raccolta dello stato

$snap = @{
  private = @{ state = 'offline'; ms = $null }; public = @{ state = 'offline'; ms = $null }
  listening = @(); lock = $null; processes = @(); ramBytes = 0; cpuPercent = $null
  tasks = @{}; serverInfo = $null; watchdogInfo = $null; watchdog = $null
  maintenanceSince = $null; ownerStopSince = $null; observability = $null; ingress = @()
  ingressAt = $null; tailscale = '-'; disk = $null; backup = $null; events = @(); errorsLastHour = 0
  model = $null; bootTime = $null; logSize = 0
}
$clock = @{ fast = [DateTime]::MinValue; medium = [DateTime]::MinValue; slow = [DateTime]::MinValue; ingress = [DateTime]::MinValue }
$cpuSample = $null
$jobs = @{ observability = $null; ingress = $null; start = $null }
$toast = $null

# Un solo client HTTP riusato e richieste asincrone raccolte a ogni giro: niente client nuovi,
# niente runspace in background, e la console non resta mai ferma ad aspettare la rete.
$httpHandler = [Net.Http.SocketsHttpHandler]::new()
$httpHandler.AllowAutoRedirect = $true
$httpHandler.MaxAutomaticRedirections = 3
$httpHandler.PooledConnectionLifetime = [TimeSpan]::FromMinutes(5)
$http = [Net.Http.HttpClient]::new($httpHandler)
$http.Timeout = [TimeSpan]::FromSeconds(15)
$probes = @{}
$ingressChecks = @(
  @{ name = 'Sito'; url = 'https://nexusnxs.com/' },
  @{ name = 'AI pubblica'; url = 'https://ai.nexusnxs.com/readyz' }
)
$ingressResults = [ordered]@{}

function Start-Probe([string]$Name, [string]$Url, [int]$TimeoutMs) {
  if ($probes.ContainsKey($Name)) { return }
  $cancel = [Threading.CancellationTokenSource]::new($TimeoutMs)
  $probes[$Name] = @{ task = $http.GetAsync($Url, $cancel.Token); cancel = $cancel; timer = [Diagnostics.Stopwatch]::StartNew(); doneMs = $null }
}

function Update-ProbeMarks {
  # Annota l'istante reale di arrivo: la latenza non include il tempo prima della raccolta.
  foreach ($probe in $probes.Values) {
    if ($null -eq $probe.doneMs -and $probe.task.IsCompleted) { $probe.doneMs = $probe.timer.ElapsedMilliseconds }
  }
}

function Complete-Probe([string]$Name, [switch]$Wait) {
  $probe = $probes[$Name]
  if (-not $probe) { return $null }
  if ($Wait) {
    $deadline = [DateTime]::UtcNow.AddSeconds(16)
    while (-not $probe.task.IsCompleted -and [DateTime]::UtcNow -lt $deadline) { Update-ProbeMarks; Start-Sleep -Milliseconds 5 }
  }
  Update-ProbeMarks
  if (-not $probe.task.IsCompleted) { return $null }
  $probes.Remove($Name)
  $probe.cancel.Dispose()
  $ms = if ($null -ne $probe.doneMs) { $probe.doneMs } else { $probe.timer.ElapsedMilliseconds }
  if ($probe.task.Status -ne [Threading.Tasks.TaskStatus]::RanToCompletion) { return @{ status = 0; ms = $ms; body = $null } }
  $response = $probe.task.Result
  try {
    $body = try { $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() } catch { $null }
    return @{ status = [int]$response.StatusCode; ms = $ms; body = $body }
  } finally { $response.Dispose() }
}

function ConvertTo-Readiness($Result) {
  if (-not $Result -or -not $Result.status) { return @{ state = 'offline'; ms = $null } }
  if ($Result.status -eq 200) {
    $status = try { ($Result.body | ConvertFrom-Json).status } catch { '' }
    return @{ state = $(if ($status -eq 'ready') { 'ready' } else { 'offline' }); ms = $Result.ms }
  }
  if ($Result.status -eq 503) { return @{ state = 'warming'; ms = $Result.ms } }
  # Compatibilità con build che proteggevano /readyz: risponde, quindi è attivo.
  if ($Result.status -in @(401, 404)) { return @{ state = 'ready'; ms = $Result.ms } }
  return @{ state = 'offline'; ms = $null }
}

function Receive-Finished([string]$Name) {
  $job = $jobs[$Name]
  if (-not $job -or $job.State -notin @('Completed', 'Failed', 'Stopped')) { return $false, $null }
  $result = try { Receive-Job -Job $job -ErrorAction SilentlyContinue } catch { $null }
  Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  $jobs[$Name] = $null
  return $true, $result
}

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try { return [IO.File]::ReadAllText($Path) | ConvertFrom-Json } catch { return $null }
}

function Get-FlagSince([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  return (Get-Item -LiteralPath $Path).LastWriteTime
}

function Update-Events {
  if (-not (Test-Path -LiteralPath $paths.log -PathType Leaf)) { $script:snap.events = @(); return }
  $item = Get-Item -LiteralPath $paths.log
  # Il registro si rilegge solo quando cambia: niente decodifica JSON a vuoto.
  $signature = "$($item.Length)|$($item.LastWriteTimeUtc.Ticks)"
  if ($signature -eq $script:logSignature -and ([DateTime]::UtcNow - $script:logReadAt).TotalMinutes -lt 1) { return }
  $script:logSignature = $signature
  $script:logReadAt = [DateTime]::UtcNow
  $script:snap.logSize = $item.Length
  $lines = @(Get-Content -LiteralPath $paths.log -Tail 400 -ErrorAction SilentlyContinue)
  $hourAgo = [DateTime]::UtcNow.AddHours(-1)
  $parsed = foreach ($line in $lines) {
    try { $entry = $line | ConvertFrom-Json } catch { continue }
    if (-not $entry.timestamp) { continue }
    if ($entry.message -like 'Servizio AI preparato*' -and $entry.model) { $script:snap.model = [string]$entry.model }
    [pscustomobject]@{ at = ([DateTime]$entry.timestamp).ToUniversalTime(); level = [string]$entry.level; message = ([string]$entry.message -replace '\s+', ' ').Trim() }
  }
  $parsed = @($parsed)
  $script:snap.errorsLastHour = @($parsed | Where-Object { $_.level -eq 'error' -and $_.at -gt $hourAgo }).Count
  $script:snap.events = @($parsed | Select-Object -Last 12)
}

function Update-Processes {
  $lock = Read-JsonFile $paths.lock
  $script:snap.lock = $lock
  $roots = @()
  if ($lock -and [int]$lock.pid -gt 0 -and (Get-Process -Id ([int]$lock.pid) -ErrorAction SilentlyContinue)) { $roots += [int]$lock.pid }
  else { $roots += @(Get-NetTCPConnection -State Listen -LocalPort $PrivatePort -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.OwningProcess }) }
  $roots = @($roots | Where-Object { $_ -gt 0 -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) } | Sort-Object -Unique)
  if (-not $roots.Count) { $script:snap.processes = @(); $script:snap.ramBytes = 0; $script:snap.cpuPercent = $null; $script:processTree = $null; return }
  # L'albero dei processi (WMI, costoso) si ricostruisce solo se cambia la radice o ogni 30 s.
  $rootKey = $roots -join ','
  if (-not $script:processTree -or $script:processTree.key -ne $rootKey -or ([DateTime]::UtcNow - $script:processTree.at).TotalSeconds -ge 30) {
    $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId -ErrorAction SilentlyContinue)
    $children = @{}
    foreach ($process in $all) {
      $parent = [int]$process.ParentProcessId
      if (-not $children.ContainsKey($parent)) { $children[$parent] = [Collections.Generic.List[int]]::new() }
      $children[$parent].Add([int]$process.ProcessId)
    }
    $tree = [Collections.Generic.HashSet[int]]::new()
    $queue = [Collections.Generic.Queue[int]]::new()
    foreach ($root in $roots) { $queue.Enqueue($root) }
    while ($queue.Count) {
      $id = $queue.Dequeue()
      if (-not $tree.Add($id)) { continue }
      if ($children.ContainsKey($id)) { foreach ($child in $children[$id]) { $queue.Enqueue($child) } }
    }
    $script:processTree = @{ key = $rootKey; at = [DateTime]::UtcNow; ids = @($tree) }
  }
  $live = @(Get-Process -Id $script:processTree.ids -ErrorAction SilentlyContinue)
  $script:snap.processes = $live
  $script:snap.ramBytes = ($live | Measure-Object -Property WorkingSet64 -Sum).Sum
  $cpuSeconds = 0.0
  foreach ($process in $live) { try { $cpuSeconds += $process.TotalProcessorTime.TotalSeconds } catch {} }
  $now = [DateTime]::UtcNow
  if ($script:cpuSample) {
    $elapsed = ($now - $script:cpuSample.at).TotalSeconds
    if ($elapsed -gt 0.5) {
      $percent = (($cpuSeconds - $script:cpuSample.cpu) / $elapsed / [Environment]::ProcessorCount) * 100
      $script:snap.cpuPercent = [Math]::Round([Math]::Max(0.0, $percent), 1)
    }
  }
  $script:cpuSample = @{ at = $now; cpu = $cpuSeconds }
}

$taskScheduler = $null
function Update-Tasks {
  # Il servizio COM dell'Utilità di pianificazione costa ~15 ms contro ~700 ms dei cmdlet CIM.
  # Gli oggetti hanno la stessa forma usata dalle sezioni (State, Settings.Enabled, Principal.LogonType).
  $tasks = @{}
  $infos = @{}
  try {
    if (-not $script:taskScheduler) { $script:taskScheduler = New-Object -ComObject Schedule.Service; $script:taskScheduler.Connect() }
    $folder = $script:taskScheduler.GetFolder('\')
    foreach ($name in @('NexusNXS Server', 'NexusNXS Watchdog', 'NexusNXS Console', 'NexusNXS Desktop Bridge')) {
      $task = try { $folder.GetTask($name) } catch { $null }
      if (-not $task) { continue }
      $state = switch ([int]$task.State) { 1 { 'Disabled' } 2 { 'Queued' } 3 { 'Ready' } 4 { 'Running' } default { 'Unknown' } }
      $logon = switch ([int]$task.Definition.Principal.LogonType) { 2 { 'S4U' } 3 { 'Interactive' } 5 { 'ServiceAccount' } 1 { 'Password' } default { 'None' } }
      $next = [DateTime]$task.NextRunTime
      $tasks[$name] = [pscustomobject]@{
        TaskName = $name; State = $state
        Settings = [pscustomobject]@{ Enabled = [bool]$task.Enabled }
        Principal = [pscustomobject]@{ LogonType = $logon }
      }
      $infos[$name] = [pscustomobject]@{ LastTaskResult = [int64]$task.LastTaskResult; NextRunTime = $(if ($next.Year -gt 1900) { $next } else { $null }) }
    }
  } catch { $script:taskScheduler = $null }
  $script:snap.tasks = $tasks
  $script:snap.serverInfo = $infos['NexusNXS Server']
  $script:snap.watchdogInfo = $infos['NexusNXS Watchdog']
}

function Add-SystemHistory {
  $system = if ($script:snap.observability) { $script:snap.observability.system } else { $null }
  if (-not $system) { return }
  Add-History 'cpu' $system.cpuPercent
  Add-History 'memory' $system.memoryPercent
  Add-History 'gpu' $system.gpuPercent
}

function Update-Snapshot([switch]$Force) {
  $now = [DateTime]::UtcNow
  # Nella console i controlli lenti (telemetria, Internet) girano in background: i tasti restano immediati.
  $wait = -not $interactive
  # Da ridotta a icona nessuno guarda: controlli più distanziati, stessi dati appena torna in primo piano.
  $idle = $interactive -and $script:minimized
  $fastEvery = if ($idle) { [Math]::Max(6, $RefreshSeconds) } else { $RefreshSeconds }
  $mediumEvery = if ($idle) { 20 } else { 5 }
  if ($Force -or ($now - $clock.fast).TotalSeconds -ge $fastEvery) {
    Start-Probe 'private' "http://127.0.0.1:$PrivatePort/readyz" 1500
    Start-Probe 'public' "http://127.0.0.1:$PublicPort/readyz" 1500
    foreach ($name in @('private', 'public')) {
      $result = Complete-Probe $name -Wait:$wait
      if ($result) { $script:snap[$name] = ConvertTo-Readiness $result }
    }
    # Le porte in ascolto servono solo a distinguere "non pronto" da "spento": se risponde, sono aperte.
    $script:snap.listening = if ($script:snap.private.state -eq 'ready' -and $script:snap.public.state -eq 'ready') { @($PrivatePort, $PublicPort) }
      else { @(Get-NetTCPConnection -State Listen -LocalPort $PrivatePort, $PublicPort -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique) }
    $script:snap.maintenanceSince = Get-FlagSince $paths.maintenance
    $script:snap.ownerStopSince = Get-FlagSince $paths.ownerStop
    $script:snap.watchdog = Read-JsonFile $paths.watchdogState
    Update-Events
    Add-History 'latency' $(if ($script:snap.private.state -eq 'ready') { $script:snap.private.ms } else { 0 })
    $clock.fast = $now
    $script:dataVersion++
  }
  if ($Force -or ($now - $clock.medium).TotalSeconds -ge $mediumEvery) {
    Update-Processes
    Add-History 'serverCpu' $script:snap.cpuPercent
    Start-Probe 'observability' "http://127.0.0.1:$PrivatePort/internal/observability" 12000
    $clock.medium = $now
    $script:dataVersion++
  }
  $slowEvery = if ($idle) { 60 } else { 30 }
  if ($Force -or ($now - $clock.slow).TotalSeconds -ge $slowEvery) {
    Update-Tasks
    $service = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
    $script:snap.tailscale = if ($service) { [string]$service.Status } else { 'non installato' }
    $driveName = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($DataRoot)).TrimEnd('\').TrimEnd(':')
    $script:snap.disk = try { $drive = [IO.DriveInfo]::new($driveName); [pscustomobject]@{ Free = $drive.AvailableFreeSpace; Used = $drive.TotalSize - $drive.AvailableFreeSpace } } catch { $null }
    $script:snap.backup = if (Test-Path -LiteralPath $paths.backups) {
      Get-ChildItem -LiteralPath $paths.backups -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    } else { $null }
    if (-not $script:snap.bootTime) {
      $script:snap.bootTime = try { (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime } catch { $null }
    }
    $clock.slow = $now
    $script:dataVersion++
  }
  if (-not $Offline -and ($Force -or ($now - $clock.ingress).TotalSeconds -ge 30)) {
    foreach ($check in $ingressChecks) { Start-Probe "ingress:$($check.name)" $check.url 6000 }
    $clock.ingress = $now
  }

  # Esiti delle richieste in corso: raccolti appena pronti.
  $result = Complete-Probe 'observability' -Wait:$wait
  if ($result) {
    $script:snap.observability = if ($result.status -eq 200) { try { $result.body | ConvertFrom-Json } catch { $null } } else { $null }
    Add-SystemHistory
    $script:dataVersion++
  }
  foreach ($check in $ingressChecks) {
    $result = Complete-Probe "ingress:$($check.name)" -Wait:$wait
    if ($result) {
      $script:ingressResults[$check.name] = [pscustomobject]@{ name = $check.name; status = $result.status; ms = $result.ms }
      $script:snap.ingress = @($script:ingressResults.Values)
      $script:snap.ingressAt = Get-Date
      $script:dataVersion++
    }
  }
  $done, $null = Receive-Finished 'start'
  if ($done) { $script:toast = @{ text = 'Richiesta di avvio completata.'; tone = 'ok'; until = (Get-Date).AddSeconds(6) } }
}

#endregion

#region 03 — Interpretazione

function Get-ServerPhase {
  $privateState = $snap.private.state
  $publicState = $snap.public.state
  if ($privateState -eq 'ready' -and $publicState -eq 'ready') {
    return @{ key = 'ready'; label = 'OPERATIVO'; tone = 'ok'; detail = 'Server pronto, raggiungibile in privato e dal web' }
  }
  if ($snap.ownerStopSince -and $privateState -eq 'offline') {
    return @{ key = 'stopped'; label = 'ARRESTATO'; tone = 'muted'; detail = 'Fermato da te: il watchdog non lo riaccende. A per avviarlo' }
  }
  if ('warming' -in @($privateState, $publicState) -or ($jobs.start)) {
    return @{ key = 'warming'; label = 'AVVIO'; tone = 'warn'; detail = 'Gateway attivo, preparazione del motore AI in corso' }
  }
  if ($privateState -eq 'ready') {
    return @{ key = 'partial'; label = 'PARZIALE'; tone = 'warn'; detail = 'Accesso privato pronto, gateway pubblico non pronto' }
  }
  if ($snap.listening.Count) {
    return @{ key = 'unready'; label = 'NON PRONTO'; tone = 'warn'; detail = 'Porte aperte ma il servizio non risponde come pronto' }
  }
  $hint = if ($snap.tasks['NexusNXS Watchdog']) { 'il watchdog interviene entro 2 minuti' } else { 'A per avviarlo' }
  return @{ key = 'offline'; label = 'NON ATTIVO'; tone = 'err'; detail = "Server non raggiungibile: $hint" }
}

function Format-Readiness($Probe, [int]$Port) {
  switch ($Probe.state) {
    'ready' { return (V '● pronto' 'ok') + (V (" · porta $Port · $($Probe.ms) ms") 'muted') }
    'warming' { return (V '● in preparazione' 'warn') + (V " · porta $Port" 'muted') }
    default { return (V '● non raggiungibile' 'err') + (V " · porta $Port" 'muted') }
  }
}

function Format-TaskResult($Info) {
  if (-not $Info) { return V '-' 'muted' }
  switch ([int64]$Info.LastTaskResult) {
    0 { return V 'ultimo esito ok' 'muted' }
    267009 { return V 'in esecuzione' 'muted' }
    267011 { return V 'mai eseguito' 'muted' }
    default { return V ('ultimo esito 0x{0:X8}' -f [int64]$Info.LastTaskResult) 'warn' }
  }
}

function Get-Sections {
  $phase = Get-ServerPhase
  $serverTask = $snap.tasks['NexusNXS Server']
  $watchdogTask = $snap.tasks['NexusNXS Watchdog']
  $consoleTask = $snap.tasks['NexusNXS Console']
  $now = Get-Date

  $started = if ($snap.lock -and $snap.lock.createdAt) { [DateTimeOffset]::FromUnixTimeMilliseconds([long]$snap.lock.createdAt).LocalDateTime } else { $null }
  $uptime = if ($started -and $snap.processes.Count) {
    (V (Format-Span ($now - $started)) 'text') + (V (" · dalle $(Format-Clock $started)") 'muted')
  } else { V '-' 'muted' }
  $boot = if ($snap.bootTime) {
    $line = V (Format-Clock $snap.bootTime) 'text'
    if ($started -and $started -gt $snap.bootTime) {
      $afterBoot = $started - $snap.bootTime
      $line += if ($afterBoot.TotalMinutes -lt 10) { V " · server avviato dopo $(Format-Span $afterBoot)" 'muted' } else { V " · $(Format-Span ($now - $snap.bootTime)) fa" 'muted' }
    }
    $line
  } else { V '-' 'muted' }
  $autostart = if (-not $serverTask) { V 'non installato' 'err' }
    elseif (-not $serverTask.Settings.Enabled) { V 'disattivato' 'warn' }
    elseif ($serverTask.Principal.LogonType -eq 'S4U') { (V "all'accensione" 'text') + (V ' · anche senza login' 'muted') }
    else { (V "all'accesso" 'text') + (V ' · richiede il login' 'muted') }
  $mainPid = if ($snap.lock -and [int]$snap.lock.pid -gt 0) { [int]$snap.lock.pid } else { $null }
  $processLine = if ($snap.processes.Count) {
    (V "PID $mainPid" 'text') + (V " · $($snap.processes.Count) processi" 'muted')
  } else { V 'nessun processo' 'muted' }
  $load = if ($snap.processes.Count) {
    (Format-Spark (Get-History 'serverCpu') 12 'violet' 100) + '  ' + (V (Format-Bytes $snap.ramBytes) 'text') + (V ' RAM' 'muted') +
      $(if ($null -ne $snap.cpuPercent) { (V ' · ' 'muted') + (V "$($snap.cpuPercent)%" 'text') + (V ' CPU' 'muted') } else { '' })
  } else { V '-' 'muted' }
  $latency = if ($snap.private.state -eq 'ready') {
    (Format-Spark (Get-History 'latency') 12 'ok') + '  ' + (V "$($snap.private.ms) ms" 'text')
  } else { (Format-Spark (Get-History 'latency') 12 'ok') + '  ' + (V 'in attesa' 'muted') }

  $service = @{
    title = 'SERVIZIO'
    rows = @(
      @('Privato', (Format-Readiness $snap.private $PrivatePort)),
      @('Pubblico', (Format-Readiness $snap.public $PublicPort)),
      @('Latenza', $latency),
      @('Attivo da', $uptime),
      @('Accensione PC', $boot),
      @('Processi', $processLine),
      @('Risorse', $load),
      @('Avvio auto', $autostart),
      @('Attività', $(if ($serverTask) { (V ([string]$serverTask.State) 'text') + (V ' · ' 'muted') + (Format-TaskResult $snap.serverInfo) } else { V '-' 'muted' }))
    )
  }

  $observability = $snap.observability
  $ai = @{ title = 'MOTORE AI'; rows = @() }
  $ai.rows += , @('Modello', $(if ($snap.model) { V $snap.model 'text' } else { V 'in attesa del primo caricamento' 'muted' }))
  if ($observability) {
    $performance = $observability.performance
    $requests = $observability.requests
    $system = $observability.system
    $ai.rows += , @('Risposta', (V "P50 $([Math]::Round($performance.p50Ms / 1000, 1)) s" 'text') + (V " · P95 $([Math]::Round($performance.p95Ms / 1000, 1)) s" 'muted'))
    $ai.rows += , @('Coda', (V "$($requests.active)/$($requests.concurrency) attive" 'text') + (V " · $($requests.queued)/$($requests.queueLimit) in attesa" 'muted'))
    foreach ($meter in @(@('CPU', 'cpu', $system.cpuPercent, 'accent'), @('RAM', 'memory', $system.memoryPercent, 'violet'), @('GPU', 'gpu', $system.gpuPercent, 'cyan'))) {
      $percent = [double]$meter[2]
      $tone = if ($percent -ge 90) { 'err' } elseif ($percent -ge 75) { 'warn' } else { $meter[3] }
      $ai.rows += , @($meter[0], (Format-Bar ($percent / 100) 14 $tone) + '  ' + (V ("{0,3}%" -f [int]$percent) 'text') + '  ' + (Format-Spark (Get-History $meter[1]) 12 $tone 100))
    }
    $ratio = if ($performance.samples) { [Math]::Round(100 * $performance.successful / $performance.samples) } else { $null }
    if ($null -ne $ratio) { $ai.rows += , @('Esito', (V "$ratio% riuscite" $(if ($ratio -ge 95) { 'text' } else { 'warn' })) + (V " · su $($performance.samples) richieste" 'muted')) }
  } else {
    $ai.rows += , @('Telemetria', (V 'non disponibile finché il server non è pronto' 'muted'))
  }

  $watch = @{ title = 'SORVEGLIANZA'; rows = @() }
  $watch.rows += , @('Watchdog', $(if (-not $watchdogTask) { V 'non installato' 'warn' } elseif (-not $watchdogTask.Settings.Enabled) { V 'disattivato' 'warn' } else { (V '● attivo' 'ok') + (V ' · ogni 2 minuti' 'muted') }))
  $checked = if ($snap.watchdog -and $snap.watchdog.checkedAt) { ([DateTime]$snap.watchdog.checkedAt).ToLocalTime() } else { $null }
  $next = if ($snap.watchdogInfo -and $snap.watchdogInfo.NextRunTime) { $snap.watchdogInfo.NextRunTime } else { $null }
  $watch.rows += , @('Controllo', $(if ($checked) { (V "$(Format-Span ($now - $checked)) fa" 'text') + $(if ($next) { V " · prossimo $(Format-Clock $next)" 'muted' } else { '' }) } else { V 'nessun controllo registrato' 'muted' }))
  $failures = if ($snap.watchdog) { [int]$snap.watchdog.failures } else { 0 }
  $recentRestarts = if ($snap.watchdog) { @($snap.watchdog.restarts | Where-Object { $_ -and ([DateTime]$_).ToUniversalTime() -gt [DateTime]::UtcNow.AddHours(-1) }).Count } else { 0 }
  $watch.rows += , @('Esiti', (V "$failures falliti" $(if ($failures) { 'warn' } else { 'text' })) + (V " · riavvii $recentRestarts/2 in 1 h" 'muted'))
  $watch.rows += , @('Manutenzione', $(if ($snap.maintenanceSince -and ($now - $snap.maintenanceSince).TotalHours -lt 2) { (V 'attiva' 'warn') + (V " · watchdog in pausa · scade alle $($snap.maintenanceSince.AddHours(2).ToString('HH:mm'))" 'muted') } else { V 'no' 'text' }))
  $watch.rows += , @('Arresto voluto', $(if ($snap.ownerStopSince) { (V 'sì' 'warn') + (V " · dalle $(Format-Clock $snap.ownerStopSince) · scade al riavvio del PC" 'muted') } else { V 'no' 'text' }))
  $watch.rows += , @('Console', $(if ($consoleTask) { (V "all'accesso" 'text') + (V ' · anche dal menu Start' 'muted') } else { V 'avvio automatico non installato' 'muted' }))

  $net = @{ title = 'RETE'; rows = @() }
  if ($Offline) {
    $net.rows += , @('Internet', (V 'controlli disattivati' 'muted'))
  } elseif (-not $snap.ingress.Count) {
    $net.rows += , @('Internet', (V 'verifica in corso…' 'muted'))
  } else {
    foreach ($check in $snap.ingress) {
      $tone = if ($check.status -ge 200 -and $check.status -lt 400) { 'ok' } else { 'err' }
      $label = if ($check.status) { "● $($check.status)" } else { '● offline' }
      $net.rows += , @($check.name, (V $label $tone) + (V " · $($check.ms) ms" 'muted'))
    }
  }
  $net.rows += , @('Tailscale', $(if ($snap.tailscale -eq 'Running') { V '● attivo' 'ok' } else { V "● $($snap.tailscale)" 'warn' }))

  $data = @{ title = 'DATI'; rows = @() }
  $data.rows += , @('Cartella', (V $DataRoot 'text'))
  if ($snap.disk) {
    $total = $snap.disk.Used + $snap.disk.Free
    $freePercent = if ($total) { [Math]::Round(100 * $snap.disk.Free / $total) } else { 0 }
    $diskTone = if ($freePercent -lt 10) { 'warn' } else { 'accent' }
    $data.rows += , @('Disco', (Format-Bar (1 - $freePercent / 100) 12 $diskTone) + '  ' + (V (Format-Bytes $snap.disk.Free) 'text') + (V " liberi · $freePercent%" 'muted'))
  }
  $data.rows += , @('Ultimo backup', $(if ($snap.backup) { (V $snap.backup.Name 'text') + (V " · $(Format-Clock $snap.backup.LastWriteTime) · cifrato" 'muted') } else { V 'nessuno' 'warn' }))
  $security = if ($observability) { $observability.security } else { $null }
  if ($security) {
    $integrity = if ($security.integrity) { V 'integro' 'ok' } else { V 'da verificare' 'warn' }
    $data.rows += , @('Sicurezza', $integrity + (V " · $($security.counts.critical) critici in 24 h" 'muted'))
  }
  $data.rows += , @('Registro', (V (Format-Bytes $snap.logSize) 'text') + (V " · errori in 1 h: $($snap.errorsLastHour)" $(if ($snap.errorsLastHour) { 'warn' } else { 'muted' })))

  # Riepilogo per il pannello di stato in alto.
  $summary = [Collections.Generic.List[string]]::new()
  if ($started -and $snap.processes.Count) { $summary.Add((V 'attivo ' 'muted') + (V (Format-Span ($now - $started)) 'text')) }
  if ($snap.model) { $summary.Add((V 'modello ' 'muted') + (V $snap.model 'text')) }
  if ($observability) {
    $summary.Add((V 'P50 ' 'muted') + (V "$([Math]::Round($observability.performance.p50Ms / 1000, 1)) s" 'text'))
    $summary.Add((V 'coda ' 'muted') + (V "$($observability.requests.queued)/$($observability.requests.queueLimit)" 'text'))
  }
  $summary.Add((V 'errori 1 h ' 'muted') + (V $snap.errorsLastHour $(if ($snap.errorsLastHour) { 'warn' } else { 'text' })))

  return @{ phase = $phase; summary = $summary.ToArray(); left = @($service, $watch); right = @($ai, $net, $data) }
}

#endregion

#region 04 — Disegno

function Get-Size {
  if (-not $interactive) { return @{ width = 118; height = 60 } }
  try { return @{ width = [Math]::Max(60, [Console]::WindowWidth); height = [Math]::Max(20, [Console]::WindowHeight) } } catch { return @{ width = 118; height = 40 } }
}

function Format-Card($Section, [int]$Width, [int]$MinRows = 0, [int]$LabelWidth = 16) {
  # Scheda con angoli arrotondati: titolo nel bordo, righe etichetta/valore, altezza minima per allineare le colonne.
  $lines = [Collections.Generic.List[string]]::new()
  $inner = $Width - 4
  $title = " $($Section.title) "
  $lines.Add((V '╭─' 'border') + $T.bold + (V $title 'accent') + (V ('─' * [Math]::Max(1, $Width - 3 - $title.Length)) 'border') + (V '╮' 'border'))
  $count = 0
  foreach ($row in $Section.rows) {
    # In @('etichetta', (V a) + (V b)) la virgola lega più del +: i pezzi del valore arrivano separati.
    $value = (@($row | Select-Object -Skip 1) | ForEach-Object { [string]$_ }) -join ''
    $content = ' ' + (V ([string]$row[0]).PadRight($LabelWidth) 'muted') + $value
    $lines.Add((V '│' 'border') + ' ' + (Format-Fit $content $inner -Pad) + ' ' + (V '│' 'border'))
    $count += 1
  }
  while ($count -lt $MinRows) { $lines.Add((V '│' 'border') + (' ' * ($Width - 2)) + (V '│' 'border')); $count += 1 }
  $lines.Add((V ('╰' + ('─' * ($Width - 2)) + '╯') 'border'))
  return , $lines.ToArray()
}

function Format-Header([int]$Width, [DateTime]$Now) {
  $brand = '  ' + (Get-Gradient '◆ NEXUSNXS' $palette.violet $palette.cyan) + (V '   Server Console' 'muted')
  $stamp = $Now.ToString('dddd d MMMM · HH:mm:ss', $italian)
  $gap = [Math]::Max(2, $Width - (Get-Visible $brand).Length - $stamp.Length - 1)
  return $brand + (' ' * $gap) + (V $stamp 'muted')
}

function Format-Hero($Phase, [string[]]$Summary, [int]$Width, [DateTime]$Now) {
  # Pannello fermo: nessun riflesso o barra che scorre (sembrerebbe un caricamento continuo).
  # Si muove solo l'indicatore di stato, che respira piano quando il server è vivo.
  $lines = [Collections.Generic.List[string]]::new()
  $inner = $Width - 4
  $alive = $interactive -and $Phase.key -in @('ready', 'warming')
  $lines.Add((V ('╭' + ('─' * ($Width - 2)) + '╮') 'border'))

  # Indicatore che respira (ciclo di 2,4 s): la console è viva, senza distrarre.
  $dot = V '●' $Phase.tone
  if ($alive -and $useColor) {
    $wave = (1 + [Math]::Sin(2 * [Math]::PI * ($Now.TimeOfDay.TotalSeconds / 2.4))) / 2
    $dot = (Get-MixedTone $palette[$Phase.tone] $palette.dim (0.6 * (1 - $wave))) + '●' + $T.reset
  }
  $head = ' ' + $dot + '  ' + (Format-Chip $Phase.label $Phase.tone) + '  ' + (V $Phase.detail 'text')
  $tail = V "v$version" 'dim'
  $gap = [Math]::Max(2, $inner - (Get-Visible $head).Length - (Get-Visible $tail).Length - 1)
  $lines.Add((V '│' 'border') + ' ' + (Format-Fit ($head + (' ' * $gap) + $tail + ' ') $inner -Pad) + ' ' + (V '│' 'border'))
  $line = '    ' + ($Summary -join (V '   ·   ' 'border'))
  $lines.Add((V '│' 'border') + ' ' + (Format-Fit $line $inner -Pad) + ' ' + (V '│' 'border'))
  $lines.Add((V ('╰' + ('─' * ($Width - 2)) + '╯') 'border'))
  return , $lines.ToArray()
}

function Get-KeyHints {
  $running = $snap.private.state -ne 'offline' -or $snap.listening.Count
  return @(
    @('R', 'riavvia'), @('A', $(if ($running) { 'arresta' } else { 'avvia' })), @('M', 'manutenzione'),
    @('L', 'registro'), @('D', 'diagnostica'), @('W', 'web app'), @('C', 'dati'),
    @('P', 'spegni PC'), @('H', 'guida'), @('Q', 'esci')
  )
}

function Get-StackHeight($Cards) { return ($Cards | ForEach-Object { $_.rows.Count + 2 } | Measure-Object -Sum).Sum }

function Build-Frame {
  $size = Get-Size
  $width = $size.width - 1
  $sections = Get-Sections
  $phase = $sections.phase
  $lines = [Collections.Generic.List[string]]::new()
  $now = Get-Date
  $full = $width - 2

  $lines.Add((Format-Header $width $now))
  $lines.Add('')
  $script:heroState = @{ index = $lines.Count; phase = $phase; summary = $sections.summary; width = $full; header = $width }
  foreach ($line in (Format-Hero $phase $sections.summary $full $now)) { $lines.Add('  ' + $line) }
  if ($toast -and $now -lt $toast.until) { $lines.Add('    ' + (V '▸ ' $toast.tone) + (V $toast.text $toast.tone)) } else { $lines.Add('') }

  if ($width -ge 112) {
    $columnWidth = [int][Math]::Floor(($full - 2) / 2)
    $rightWidth = $full - 2 - $columnWidth
    $leftHeight = Get-StackHeight $sections.left
    $rightHeight = Get-StackHeight $sections.right
    $left = [Collections.Generic.List[string]]::new()
    $right = [Collections.Generic.List[string]]::new()
    for ($i = 0; $i -lt $sections.left.Count; $i++) {
      $card = $sections.left[$i]
      $minimum = if ($i -eq $sections.left.Count - 1 -and $leftHeight -lt $rightHeight) { $card.rows.Count + $rightHeight - $leftHeight } else { 0 }
      $left.AddRange([string[]](Format-Card $card $columnWidth $minimum))
    }
    for ($i = 0; $i -lt $sections.right.Count; $i++) {
      $card = $sections.right[$i]
      $minimum = if ($i -eq $sections.right.Count - 1 -and $rightHeight -lt $leftHeight) { $card.rows.Count + $leftHeight - $rightHeight } else { 0 }
      $right.AddRange([string[]](Format-Card $card $rightWidth $minimum))
    }
    for ($i = 0; $i -lt [Math]::Max($left.Count, $right.Count); $i++) {
      $l = if ($i -lt $left.Count) { $left[$i] } else { ' ' * $columnWidth }
      $r = if ($i -lt $right.Count) { $right[$i] } else { '' }
      $lines.Add('  ' + $l + '  ' + $r)
    }
  } else {
    foreach ($section in @($sections.left + $sections.right)) {
      foreach ($line in (Format-Card $section $full)) { $lines.Add('  ' + $line) }
    }
  }

  $footerHeight = 3
  $room = [Math]::Max(1, $size.height - $lines.Count - $footerHeight - 2)
  $events = @($snap.events | Select-Object -Last $(if ($interactive) { [Math]::Min($room, 8) } else { 8 }))
  $eventRows = if ($events.Count) {
    @($events | ForEach-Object {
      $glyph, $tone = switch ($_.level) { 'error' { '✕', 'err' } 'warn' { '▲', 'warn' } default { '•', 'dim' } }
      , @((Format-Clock $_.at.ToLocalTime()), ((V $glyph $tone) + '  ' + (V $_.message $(if ($_.level -eq 'error') { 'err' } else { 'text' }))))
    })
  } else { @(, @('', (V 'Nessun evento registrato.' 'muted'))) }
  foreach ($line in (Format-Card @{ title = 'EVENTI RECENTI'; rows = $eventRows } $full 0 11)) { $lines.Add('  ' + $line) }

  if ($interactive) { while ($lines.Count -lt $size.height - $footerHeight) { $lines.Add('') } } else { $lines.Add('') }
  $hints = ''
  $hintLines = [Collections.Generic.List[string]]::new()
  foreach ($hint in Get-KeyHints) {
    $piece = (Format-Key $hint[0]) + ' ' + (V $hint[1] 'muted') + '   '
    if ((Get-Visible ($hints + $piece)).Length -gt ($full - 1) -and $hints) { $hintLines.Add('  ' + $hints); $hints = '' }
    $hints += $piece
  }
  if ($hints) { $hintLines.Add('  ' + $hints) }
  foreach ($hintLine in $hintLines) { $lines.Add($hintLine) }
  $lines.Add('  ' + (V 'Chiudere la console non arresta il server: è un servizio separato.' 'dim'))
  return $lines.ToArray()
}

function Update-AnimatedLines([string[]]$Lines, [DateTime]$Now) {
  # Tra due aggiornamenti dei dati cambiano solo orologio e indicatore di stato: il resto non si riscrive.
  $state = $script:heroState
  if (-not $state) { return }
  $Lines[0] = Format-Header $state.header $Now
  $hero = Format-Hero $state.phase $state.summary $state.width $Now
  $Lines[$state.index + 1] = '  ' + $hero[1]
}

$lastSize = $null
$previousLines = @()
function Write-Frame([string[]]$Lines) {
  $size = Get-Size
  if (-not $interactive) {
    foreach ($line in $Lines) { [Console]::Out.WriteLine((Format-Fit $line $size.width).TrimEnd()) }
    return
  }
  # Scrive solo le righe cambiate, posizionando il cursore: niente sfarfallio, poco lavoro per il terminale.
  $builder = [Text.StringBuilder]::new()
  $redraw = -not $script:lastSize -or $script:lastSize.width -ne $size.width -or $script:lastSize.height -ne $size.height
  if ($redraw) { [void]$builder.Append("`e[2J"); $script:previousLines = @() }
  $script:lastSize = $size
  $count = [Math]::Min($Lines.Count, $size.height)
  $fitted = [string[]]::new($count)
  for ($i = 0; $i -lt $count; $i++) {
    $fitted[$i] = $Lines[$i]
    if ($i -lt $script:previousLines.Count -and [object]::ReferenceEquals($script:previousLines[$i], $Lines[$i])) { continue }
    if ($i -lt $script:previousLines.Count -and $script:previousLines[$i] -ceq $Lines[$i]) { continue }
    [void]$builder.Append("`e[$($i + 1);1H").Append((Format-Fit $Lines[$i] ($size.width - 1))).Append("`e[K")
  }
  if ($count -lt $script:previousLines.Count) { [void]$builder.Append("`e[$($count + 1);1H`e[J") }
  $script:previousLines = $fitted
  # Aggiornamento sincronizzato (DEC 2026): il terminale mostra il fotogramma tutto insieme, mai a metà.
  if ($builder.Length) { [Console]::Out.Write("`e[?2026h" + $builder.ToString() + "`e[?2026l") }
}

#endregion

#region 05 — Ingresso e comandi

$inputQueue = [Collections.Generic.Queue[string]]::new()
# Con pwsh -File un array arriva come un'unica stringa "p,1,text:SPEGNI": si accettano entrambe le forme.
if ($scripted) { foreach ($token in @($ScriptedInput | ForEach-Object { ([string]$_).Split(',') })) { if ($token) { $inputQueue.Enqueue($token.Trim()) } } }

function Read-ConsoleKey {
  if ($scripted) {
    if (-not $inputQueue.Count) { return 'q' }
    return $inputQueue.Dequeue().ToLowerInvariant()
  }
  $key = [Console]::ReadKey($true)
  if ($key.Key -eq 'Escape') { return 'esc' }
  if ($key.Key -eq 'Enter') { return 'enter' }
  if ($key.KeyChar -eq [char]3) { return 'q' }
  return ([string]$key.KeyChar).ToLowerInvariant()
}

function Read-ConsoleText([string]$Prompt) {
  Write-Out ('  ' + (V $Prompt 'text') + ' ') -NoNewline
  if ($scripted) {
    $value = if ($inputQueue.Count) { $inputQueue.Dequeue() } else { '' }
    $value = $value -replace '^text:', ''
    Write-Out $value
    return $value
  }
  [Console]::Out.Write("`e[?25h")
  try { return [Console]::ReadLine() } finally { [Console]::Out.Write("`e[?25l") }
}

function Write-Out([string]$Text = '', [switch]$NoNewline) {
  if ($NoNewline) { [Console]::Out.Write($Text) } else { [Console]::Out.WriteLine($Text) }
}

function Open-Screen([string]$Title, [string]$Subtitle) {
  # La schermata di un'operazione copre il quadro: al ritorno va ridisegnato per intero.
  $script:lastSize = $null
  if ($interactive) { [Console]::Out.Write("`e[H`e[J") } else { Write-Out '' }
  Write-Out ('  ' + (Get-Gradient '◆ NEXUSNXS' $palette.violet $palette.cyan) + (V '   Server Console' 'muted'))
  Write-Out ''
  Write-Out ('  ' + "$($T.bold)$(V $Title 'text')")
  if ($Subtitle) { Write-Out ('  ' + (V $Subtitle 'muted')) }
  Write-Out ''
}

function Close-Screen {
  Write-Out ''
  if ($interactive) {
    Write-Out ('  ' + (V 'Premi un tasto per tornare alla console.' 'dim'))
    [void](Read-ConsoleKey)
    $script:lastSize = $null
  }
  Update-Snapshot -Force
}

function Confirm-Step([string]$Question) {
  Write-Out ('  ' + (V $Question 'text') + '  ' + (V '[S] sì   [N] no' 'muted'))
  $answer = Read-ConsoleKey
  return $answer -in @('s', 'y')
}

function Invoke-Manager([string]$ManagerAction) {
  if (-not (Test-Path -LiteralPath $ManagerPath -PathType Leaf)) {
    Write-Out ('  ' + (V 'Gestore del server non trovato.' 'err'))
    return $false
  }
  $global:LASTEXITCODE = 0
  & $pwshPath -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $ManagerPath -Action $ManagerAction 2>&1 | ForEach-Object {
    $text = ([string]$_).TrimEnd()
    if ($text) { Write-Out ('    ' + (V $text 'muted')) }
  }
  $ok = $LASTEXITCODE -eq 0
  Write-Out ''
  Write-Out ('  ' + $(if ($ok) { V '● Operazione completata.' 'ok' } else { V "● Operazione non riuscita (codice $LASTEXITCODE). Il registro è nella cartella dati, logs." 'err' }))
  return $ok
}

function Set-Toast([string]$Text, [string]$Tone = 'ok') { $script:toast = @{ text = $Text; tone = $Tone; until = (Get-Date).AddSeconds(7) } }

function Invoke-Restart {
  Open-Screen 'Riavvio coordinato del server' 'Le richieste in corso terminano, i dati vengono salvati, poi il server riparte.'
  if (-not (Confirm-Step 'Riavviare ora il server?')) { Set-Toast 'Riavvio annullato.' 'muted'; return }
  Write-Out ''
  if (Invoke-Manager 'restart') { Set-Toast 'Server riavviato e pronto.' } else { Set-Toast 'Riavvio non riuscito: apri la diagnostica (D).' 'err' }
  Close-Screen
}

function Invoke-StopOrStart {
  $running = $snap.private.state -ne 'offline' -or $snap.listening.Count
  if ($running) {
    Open-Screen 'Arresto del server' "Arresto pulito: salva i dati e chiude il servizio. Resta spento finché non lo riavvii (A) o riaccendi il PC; il watchdog non interviene."
    if (-not (Confirm-Step 'Arrestare il server?')) { Set-Toast 'Arresto annullato.' 'muted'; return }
    Write-Out ''
    if (Invoke-Manager 'stop') { Set-Toast 'Server arrestato. Premi A per riavviarlo.' 'muted' } else { Set-Toast 'Arresto non riuscito: apri la diagnostica (D).' 'err' }
  } else {
    Open-Screen 'Avvio del server' 'Avvio coordinato: verifica del runtime, gateway privato e pubblico, poi il motore AI.'
    Write-Out ''
    if (Invoke-Manager 'start') { Set-Toast 'Server avviato e pronto.' } else { Set-Toast 'Avvio non riuscito: apri la diagnostica (D).' 'err' }
  }
  Close-Screen
}

function Switch-Maintenance {
  if ($snap.maintenanceSince -and ((Get-Date) - $snap.maintenanceSince).TotalHours -lt 2) {
    Remove-Item -LiteralPath $paths.maintenance -Force -ErrorAction SilentlyContinue
    Set-Toast 'Manutenzione terminata: il watchdog è di nuovo attivo.'
  } else {
    [IO.Directory]::CreateDirectory($DataRoot) | Out-Null
    [IO.File]::WriteAllText($paths.maintenance, [DateTime]::UtcNow.ToString('o'), [Text.UTF8Encoding]::new($false))
    Set-Toast 'Manutenzione attiva: il watchdog resta in pausa per 2 ore.' 'warn'
  }
  Update-Snapshot -Force
}

function Show-Log {
  $errorsOnly = $false
  $source = 'server'
  while ($true) {
    $size = Get-Size
    $path = if ($source -eq 'server') { $paths.log } else { $paths.watchdogLog }
    $raw = if (Test-Path -LiteralPath $path) { @(Get-Content -LiteralPath $path -Tail 600 -ErrorAction SilentlyContinue) } else { @() }
    $entries = foreach ($line in $raw) {
      try { $entry = $line | ConvertFrom-Json } catch { continue }
      if ($errorsOnly -and $entry.level -notin @('error', 'warn')) { continue }
      $entry
    }
    $entries = @($entries | Select-Object -Last ([Math]::Max(5, $size.height - 9)))
    $title = if ($source -eq 'server') { 'Registro del server' } else { 'Registro del watchdog' }
    Open-Screen $title ("$path" + $(if ($errorsOnly) { ' · solo avvisi ed errori' } else { '' }))
    if (-not $entries.Count) { Write-Out ('  ' + (V 'Nessuna voce.' 'muted')) }
    foreach ($entry in $entries) {
      $tone = switch ($entry.level) { 'error' { 'err' } 'warn' { 'warn' } default { 'dim' } }
      $when = try { Format-Clock (([DateTime]$entry.timestamp).ToLocalTime()) } catch { '-' }
      Write-Out (Format-Fit ('  ' + (V $when 'muted') + '  ' + (V '●' $tone) + '  ' + (V (([string]$entry.message) -replace '\s+', ' ') 'text')) ($size.width - 1))
    }
    Write-Out ''
    Write-Out ('  ' + (V 'E' 'accent') + (V ' solo errori    ' 'muted') + (V 'S' 'accent') + (V ' server/watchdog    ' 'muted') + (V 'Esc' 'accent') + (V ' indietro' 'muted'))
    if (-not $interactive) { return }
    $deadline = (Get-Date).AddSeconds(2)
    $key = $null
    while ((Get-Date) -lt $deadline -and -not $key) {
      if ([Console]::KeyAvailable) { $key = Read-ConsoleKey } else { Start-Sleep -Milliseconds 50 }
    }
    if ($key -in @('esc', 'q', 'l')) { $script:lastSize = $null; return }
    if ($key -eq 'e') { $errorsOnly = -not $errorsOnly }
    if ($key -eq 's') { $source = if ($source -eq 'server') { 'watchdog' } else { 'server' } }
  }
}

function Show-Diagnostics {
  Open-Screen 'Diagnostica completa' 'Stato dettagliato da manage-headless-server-task.ps1 -Action status.'
  [void](Invoke-Manager 'status')
  Close-Screen
}

function Show-Help {
  Open-Screen 'Come funziona' 'Il server e la console sono separati, come un servizio e il suo pannello.'
  $help = @(
    @('Server', "Task NexusNXS Server: parte all'accensione del PC, anche senza accesso, e si riavvia se termina."),
    @('Watchdog', 'Ogni 2 minuti verifica /readyz; dopo 3 controlli falliti riavvia in modo coordinato, max 2 volte l''ora.'),
    @('Console', "Si apre all'accesso; chiuderla non tocca il server. Riaprila dal menu Start: NexusNXS Server Console."),
    @('R  riavvia', 'Arresto pulito con salvataggio dei dati, poi nuovo avvio e verifica di prontezza.'),
    @('A  arresta/avvia', 'Lo spegnimento voluto blocca il watchdog fino a quando riavvii il server o il PC.'),
    @('M  manutenzione', 'Pausa del watchdog per 2 ore: per aggiornamenti e prove senza interventi automatici.'),
    @('P  spegni PC', 'Chiede di scrivere SPEGNI o RIAVVIA, ferma prima il server, poi 60 s per annullare.'),
    @('Dati', 'Tutto resta nella cartella dati sull''SSD; i backup cifrati sono in backups, i registri in logs.')
  )
  foreach ($item in $help) { Write-Out ('  ' + (V $item[0].PadRight(18) 'accent') + (V $item[1] 'text')) }
  Close-Screen
}

function Invoke-PowerMenu {
  Open-Screen 'Alimentazione del PC' 'Il server viene arrestato in modo pulito prima di spegnere o riavviare.'
  Write-Out ('  ' + (V '1' 'accent') + (V '  Spegni il PC' 'text'))
  Write-Out ('  ' + (V '2' 'accent') + (V '  Riavvia il PC' 'text'))
  Write-Out ('  ' + (V '3' 'accent') + (V '  Annulla uno spegnimento programmato' 'text'))
  Write-Out ('  ' + (V 'Esc' 'accent') + (V ' indietro' 'muted'))
  Write-Out ''
  $choice = Read-ConsoleKey
  if ($choice -eq '3') {
    & $PowerExecutable /a 2>&1 | Out-Null
    Set-Toast 'Spegnimento programmato annullato (se presente).' 'muted'
    Update-Snapshot -Force
    return
  }
  if ($choice -notin @('1', '2')) { $script:lastSize = $null; return }
  $word = if ($choice -eq '1') { 'SPEGNI' } else { 'RIAVVIA' }
  $verb = if ($choice -eq '1') { 'spegne' } else { 'riavvia' }
  $typed = Read-ConsoleText "Per confermare scrivi $word e premi Invio (altro annulla):"
  if ([string]$typed -cne $word) {
    Write-Out ('  ' + (V 'Annullato: nessuna azione eseguita.' 'muted'))
    Set-Toast 'Spegnimento annullato.' 'muted'
    Close-Screen
    return
  }
  Write-Out ''
  Write-Out ('  ' + (V '1/2' 'accent') + (V '  Arresto pulito del server' 'text'))
  if (-not (Invoke-Manager 'stop')) {
    Write-Out ('  ' + (V 'Il server non si è arrestato correttamente: il PC non viene toccato, per proteggere i dati.' 'err'))
    Set-Toast 'Spegnimento bloccato per proteggere i dati.' 'err'
    Close-Screen
    return
  }
  # Spegnimento imminente: l'arresto non deve sopravvivere come "voluto" se l'utente annulla.
  Remove-Item -LiteralPath $paths.ownerStop -Force -ErrorAction SilentlyContinue
  Write-Out ('  ' + (V '2/2' 'accent') + (V "  Il PC si $verb tra 60 secondi" 'text'))
  $mode = if ($choice -eq '1') { '/s' } else { '/r' }
  & $PowerExecutable $mode /t 60 /d p:0:0 /c "NexusNXS: richiesto dalla Server Console." 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Out ('  ' + (V "Windows ha rifiutato la richiesta (codice $LASTEXITCODE). Il server viene riavviato." 'err'))
    [void](Invoke-Manager 'start')
    Close-Screen
    return
  }
  Write-Out ('  ' + (V 'Premi X per annullare.' 'warn'))
  $cancelled = $false
  if ($scripted) {
    $cancelled = (Read-ConsoleKey) -eq 'x'
  } else {
    $deadline = (Get-Date).AddSeconds(58)
    while ((Get-Date) -lt $deadline) {
      $left = [int][Math]::Ceiling(($deadline - (Get-Date)).TotalSeconds)
      [Console]::Out.Write("`r  " + (V "Mancano $left s " 'muted') + "`e[K")
      if ([Console]::KeyAvailable -and (Read-ConsoleKey) -eq 'x') { $cancelled = $true; break }
      Start-Sleep -Milliseconds 100
    }
    Write-Out ''
  }
  if ($cancelled) {
    & $PowerExecutable /a 2>&1 | Out-Null
    Write-Out ('  ' + (V 'Annullato. Riavvio del server…' 'ok'))
    [void](Invoke-Manager 'start')
    Set-Toast 'Spegnimento annullato, server di nuovo attivo.'
    Close-Screen
    return
  }
  Write-Out ('  ' + (V 'Spegnimento in corso. A presto.' 'muted'))
  $script:running = $false
}

function Invoke-ConsoleKey([string]$Key) {
  switch ($Key) {
    'r' { Invoke-Restart }
    'a' { Invoke-StopOrStart }
    'm' { Switch-Maintenance }
    'l' { Show-Log }
    'd' { Show-Diagnostics }
    'h' { Show-Help }
    '?' { Show-Help }
    'w' { if ($interactive) { Start-Process 'https://ai.nexusnxs.com' }; Set-Toast 'Web app aperta nel browser.' 'muted' }
    'c' { if ($interactive) { Start-Process explorer.exe -ArgumentList ('"{0}"' -f $DataRoot) }; Set-Toast 'Cartella dati aperta.' 'muted' }
    'p' { Invoke-PowerMenu }
    { $_ -in @('q', 'esc') } { $script:running = $false }
  }
}

#endregion

#region 06 — Ciclo principale

if ($Once) {
  Update-Snapshot -Force
  Write-Frame (Build-Frame)
  exit 0
}

if ($scripted) {
  $running = $true
  Update-Snapshot -Force
  Write-Frame (Build-Frame)
  while ($running -and $inputQueue.Count) { Invoke-ConsoleKey (Read-ConsoleKey) }
  exit 0
}

$created = $false
$mutex = [Threading.Mutex]::new($false, 'Local\NexusNXS.ServerConsole', [ref]$created)
if (-not $mutex.WaitOne(0)) { Write-Output 'NexusNXS Server Console è già aperta.'; exit 0 }

$Host.UI.RawUI.WindowTitle = 'NexusNXS Server Console'
$dataVersion = 0
Add-Type -Namespace NexusNxs -Name ConsoleState -MemberDefinition @'
[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
public static IntPtr Find(string title) {
  IntPtr found = IntPtr.Zero;
  EnumWindows((hWnd, lParam) => {
    var text = new System.Text.StringBuilder(256);
    GetWindowText(hWnd, text, text.Capacity);
    if (text.ToString() == title) { found = hWnd; return false; }
    return true;
  }, IntPtr.Zero);
  return found;
}
'@
$consoleWindow = [IntPtr]::Zero
function Test-ConsoleMinimized {
  if ($script:consoleWindow -eq [IntPtr]::Zero -or -not [NexusNxs.ConsoleState]::IsWindow($script:consoleWindow)) {
    $script:consoleWindow = [NexusNxs.ConsoleState]::Find('NexusNXS Server Console')
  }
  return $script:consoleWindow -ne [IntPtr]::Zero -and [NexusNxs.ConsoleState]::IsIconic($script:consoleWindow)
}
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::TreatControlCAsInput = $true
# Sfondo spazio profondo per tutta la finestra (OSC 11), ripristinato all'uscita.
if ($useColor) { [Console]::Out.Write("`e]11;rgb:09/0b/11`e\") }
[Console]::Out.Write("`e[?1049h`e[?25l`e[H`e[2J")
try {
  Write-Out ''
  Write-Out ('  ' + (Get-Gradient '◆ NEXUSNXS' $palette.violet $palette.cyan) + (V '   lettura dello stato…' 'muted'))
  Update-Snapshot -Force
  $phase = Get-ServerPhase
  if (-not $NoAutoStart -and $phase.key -eq 'offline' -and -not $snap.ownerStopSince -and
      $snap.tasks['NexusNXS Server'] -and [string]$snap.tasks['NexusNXS Server'].State -ne 'Running') {
    # Accensione senza server attivo: avvio coordinato in background, la console resta reattiva.
    $jobs.start = Start-ThreadJob -ScriptBlock { param($Pwsh, $Manager) & $Pwsh -NoLogo -NoProfile -NonInteractive -File $Manager -Action start *>&1 | Out-Null } -ArgumentList $pwshPath, $ManagerPath
    Set-Toast 'Server non attivo: avvio coordinato richiesto.' 'warn'
  }
  $running = $true
  $frame = $null
  $frameKey = ''
  $minimized = $false
  $windowCheckAt = [DateTime]::MinValue
  while ($running) {
    Update-Snapshot
    $now = Get-Date
    if (($now - $windowCheckAt).TotalMilliseconds -ge 1000) {
      $wasMinimized = $minimized
      $minimized = Test-ConsoleMinimized
      $windowCheckAt = $now
      # Tornata in primo piano: dati freschi subito.
      if ($wasMinimized -and -not $minimized) { $clock.fast = [DateTime]::MinValue; $clock.medium = [DateTime]::MinValue }
    }
    $size = Get-Size
    # Quadro completo solo quando cambiano dati, dimensioni o avviso; altrimenti solo orologio e indicatore.
    # Write-Frame scrive soltanto le righe diverse: nessun ridisegno o sfarfallio della finestra.
    $toastKey = if ($toast -and $now -lt $toast.until) { $toast.until.Ticks } else { 0 }
    $key = '{0}|{1}x{2}|{3}' -f $dataVersion, $size.width, $size.height, $toastKey
    if (-not $frame -or $key -ne $frameKey -or $null -eq $lastSize) { $frame = Build-Frame; $frameKey = $key }
    elseif (-not $minimized) { Update-AnimatedLines $frame $now }
    Write-Frame $frame
    # 5 fotogrammi al secondo in primo piano (basta al respiro dell'indicatore); ridotta a icona uno al secondo.
    $deadline = [DateTime]::UtcNow.AddMilliseconds($(if ($minimized) { 1000 } else { 200 }))
    while ([DateTime]::UtcNow -lt $deadline) {
      if ([Console]::KeyAvailable) { Invoke-ConsoleKey (Read-ConsoleKey); break }
      if ($probes.Count) { Update-ProbeMarks }
      Start-Sleep -Milliseconds $(if ($minimized) { 80 } else { 25 })
    }
  }
} catch {
  # Un errore della console non tocca il server: lo registra e lo mostra, poi chiude in modo pulito.
  $consoleLog = Join-Path $DataRoot 'logs\server-console.log'
  try {
    [IO.Directory]::CreateDirectory((Split-Path $consoleLog)) | Out-Null
    [IO.File]::AppendAllText($consoleLog, ('{0} {1} {2}' -f [DateTime]::UtcNow.ToString('o'), $_.Exception.Message, $_.InvocationInfo.PositionMessage) + [Environment]::NewLine)
  } catch {}
  [Console]::Out.Write("`e[H`e[J")
  Write-Out ('  ' + (V "La console si è interrotta: $($_.Exception.Message)" 'err'))
  Write-Out ('  ' + (V "Il server non è stato toccato. Dettagli in $consoleLog" 'muted'))
  Write-Out ('  ' + (V 'Premi un tasto per chiudere.' 'dim'))
  try { [void][Console]::ReadKey($true) } catch {}
} finally {
  foreach ($name in @('observability', 'ingress')) { if ($jobs[$name]) { Remove-Job -Job $jobs[$name] -Force -ErrorAction SilentlyContinue } }
  [Console]::Out.Write("`e[?25h`e[?1049l")
  if ($useColor) { [Console]::Out.Write("`e]111`e\") }
  [Console]::TreatControlCAsInput = $false
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}

#endregion
