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

$useColor = -not $NoColor -and -not $env:NO_COLOR
function New-Tone([string]$Hex) {
  if (-not $useColor) { return '' }
  $r = [Convert]::ToInt32($Hex.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($Hex.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($Hex.Substring(4, 2), 16)
  return "`e[38;2;$r;$g;${b}m"
}
$palette = @{
  text = 'E8EAF1'; muted = '8E95A8'; dim = '565D70'; accent = '8DB6FF'; violet = 'B9A2FF'
  ok = '52D7A0'; warn = 'F4C46E'; err = 'FF7272'
}
$T = @{
  bold = $(if ($useColor) { "`e[1m" } else { '' }); reset = $(if ($useColor) { "`e[0m" } else { '' })
}
foreach ($name in $palette.Keys) { $T[$name] = New-Tone $palette[$name] }

function Get-MixedTone([string]$From, [string]$To, [double]$Amount) {
  $channels = for ($i = 0; $i -lt 6; $i += 2) {
    $a = [Convert]::ToInt32($From.Substring($i, 2), 16)
    $b = [Convert]::ToInt32($To.Substring($i, 2), 16)
    [int][Math]::Round($a + ($b - $a) * $Amount)
  }
  return "`e[38;2;$($channels[0]);$($channels[1]);$($channels[2])m"
}
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

$readinessBlock = {
  param([int]$Port)
  $timer = [Diagnostics.Stopwatch]::StartNew()
  try {
    $status = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/readyz" -TimeoutSec 1).status
    return @{ state = $(if ($status -eq 'ready') { 'ready' } else { 'offline' }); ms = $timer.ElapsedMilliseconds }
  } catch {
    $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    if ($code -eq 503) { return @{ state = 'warming'; ms = $timer.ElapsedMilliseconds } }
    if ($code -in @(401, 404)) { return @{ state = 'ready'; ms = $timer.ElapsedMilliseconds } }
    return @{ state = 'offline'; ms = $null }
  }
}

$observabilityBlock = {
  param([int]$Port)
  try { return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/internal/observability" -TimeoutSec 10 } catch { return $null }
}

$ingressBlock = {
  $checks = @(
    @{ name = 'Sito'; url = 'https://nexusnxs.com/' },
    @{ name = 'AI pubblica'; url = 'https://ai.nexusnxs.com/readyz' }
  )
  foreach ($check in $checks) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
      $response = Invoke-WebRequest -Uri $check.url -MaximumRedirection 3 -TimeoutSec 6
      [pscustomobject]@{ name = $check.name; status = [int]$response.StatusCode; ms = $timer.ElapsedMilliseconds }
    } catch {
      $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
      [pscustomobject]@{ name = $check.name; status = $code; ms = $timer.ElapsedMilliseconds }
    }
  }
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
  $script:snap.logSize = (Get-Item -LiteralPath $paths.log).Length
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
  if ($lock -and [int]$lock.pid -gt 0) { $roots += [int]$lock.pid }
  $roots += @(Get-NetTCPConnection -State Listen -LocalPort $PrivatePort -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.OwningProcess })
  $roots = @($roots | Where-Object { $_ -gt 0 -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) } | Sort-Object -Unique)
  if (-not $roots.Count) { $script:snap.processes = @(); $script:snap.ramBytes = 0; $script:snap.cpuPercent = $null; return }
  $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name -ErrorAction SilentlyContinue)
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
  $live = @(Get-Process -Id @($tree) -ErrorAction SilentlyContinue)
  $script:snap.processes = $live
  $script:snap.ramBytes = ($live | Measure-Object -Property WorkingSet64 -Sum).Sum
  $cpuSeconds = 0.0
  foreach ($process in $live) { try { $cpuSeconds += $process.TotalProcessorTime.TotalSeconds } catch {} }
  $now = [DateTime]::UtcNow
  if ($script:cpuSample) {
    $elapsed = ($now - $script:cpuSample.at).TotalSeconds
    if ($elapsed -gt 0.5) {
      $percent = (($cpuSeconds - $script:cpuSample.cpu) / $elapsed / [Environment]::ProcessorCount) * 100
      $script:snap.cpuPercent = [Math]::Round([Math]::Max(0, $percent), 1)
    }
  }
  $script:cpuSample = @{ at = $now; cpu = $cpuSeconds }
}

function Update-Tasks {
  $script:snap.tasks = @{}
  foreach ($task in @(Get-ScheduledTask -TaskName 'NexusNXS*' -ErrorAction SilentlyContinue)) { $script:snap.tasks[$task.TaskName] = $task }
  $script:snap.serverInfo = if ($script:snap.tasks['NexusNXS Server']) { Get-ScheduledTaskInfo -TaskName 'NexusNXS Server' -ErrorAction SilentlyContinue } else { $null }
  $script:snap.watchdogInfo = if ($script:snap.tasks['NexusNXS Watchdog']) { Get-ScheduledTaskInfo -TaskName 'NexusNXS Watchdog' -ErrorAction SilentlyContinue } else { $null }
}

function Update-Snapshot([switch]$Force) {
  $now = [DateTime]::UtcNow
  # Nella console i controlli lenti (telemetria, Internet) girano in background: i tasti restano immediati.
  $synchronous = -not $interactive
  if ($Force -or ($now - $clock.fast).TotalSeconds -ge $RefreshSeconds) {
    $script:snap.private = & $readinessBlock $PrivatePort
    $script:snap.public = & $readinessBlock $PublicPort
    $script:snap.listening = @(Get-NetTCPConnection -State Listen -LocalPort $PrivatePort, $PublicPort -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique)
    $script:snap.maintenanceSince = Get-FlagSince $paths.maintenance
    $script:snap.ownerStopSince = Get-FlagSince $paths.ownerStop
    $script:snap.watchdog = Read-JsonFile $paths.watchdogState
    Update-Events
    $clock.fast = $now
  }
  if ($Force -or ($now - $clock.medium).TotalSeconds -ge 5) {
    Update-Processes
    if ($synchronous) {
      $script:snap.observability = & $observabilityBlock $PrivatePort
    } elseif (-not $jobs.observability) {
      $jobs.observability = Start-ThreadJob -ScriptBlock $observabilityBlock -ArgumentList $PrivatePort
    }
    $clock.medium = $now
  }
  if ($Force -or ($now - $clock.slow).TotalSeconds -ge 10) {
    Update-Tasks
    $service = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
    $script:snap.tailscale = if ($service) { [string]$service.Status } else { 'non installato' }
    $driveName = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($DataRoot)).TrimEnd('\').TrimEnd(':')
    $script:snap.disk = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
    $script:snap.backup = if (Test-Path -LiteralPath $paths.backups) {
      Get-ChildItem -LiteralPath $paths.backups -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    } else { $null }
    if (-not $script:snap.bootTime) {
      $script:snap.bootTime = try { (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime } catch { $null }
    }
    $clock.slow = $now
  }
  if (-not $Offline -and ($Force -or ($now - $clock.ingress).TotalSeconds -ge 30)) {
    if ($synchronous) {
      $script:snap.ingress = @(& $ingressBlock); $script:snap.ingressAt = Get-Date
    } elseif (-not $jobs.ingress) {
      $jobs.ingress = Start-ThreadJob -ScriptBlock $ingressBlock
    }
    $clock.ingress = $now
  }
  $done, $result = Receive-Finished 'observability'
  if ($done) { $script:snap.observability = $result }
  $done, $result = Receive-Finished 'ingress'
  if ($done -and $result) { $script:snap.ingress = @($result); $script:snap.ingressAt = Get-Date }
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
    if ($started -and $started -gt $snap.bootTime) { $line += V " · server avviato dopo $(Format-Span ($started - $snap.bootTime))" 'muted' }
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
    (V (Format-Bytes $snap.ramBytes) 'text') + (V ' RAM' 'muted') + $(if ($null -ne $snap.cpuPercent) { (V " · " 'muted') + (V "$($snap.cpuPercent)%" 'text') + (V ' CPU' 'muted') } else { '' })
  } else { V '-' 'muted' }

  $service = @{
    title = 'SERVIZIO'
    rows = @(
      @('Privato', (Format-Readiness $snap.private $PrivatePort)),
      @('Pubblico', (Format-Readiness $snap.public $PublicPort)),
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
    $ai.rows += , @('Risposta', (V "P50 $([Math]::Round($performance.p50Ms / 1000, 1)) s" 'text') + (V " · P95 $([Math]::Round($performance.p95Ms / 1000, 1)) s · 1° token $([Math]::Round($performance.firstTokenP50Ms / 1000, 1)) s" 'muted'))
    $ai.rows += , @('Coda', (V "$($requests.active)/$($requests.concurrency) attive" 'text') + (V " · $($requests.queued)/$($requests.queueLimit) in attesa" 'muted'))
    $ai.rows += , @('Sistema', (V "CPU $($system.cpuPercent)%" 'text') + (V " · RAM $($system.memoryPercent)% · GPU $($system.gpuPercent)%" 'muted'))
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
  $watch.rows += , @('Esiti', (V "$failures falliti di fila" $(if ($failures) { 'warn' } else { 'text' })) + (V " · riavvii $recentRestarts/2 in un'ora" 'muted'))
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
    $data.rows += , @('Spazio libero', (V (Format-Bytes $snap.disk.Free) $(if ($freePercent -lt 10) { 'warn' } else { 'text' })) + (V " · $freePercent% di $(Format-Bytes $total)" 'muted'))
  }
  $data.rows += , @('Ultimo backup', $(if ($snap.backup) { (V $snap.backup.Name 'text') + (V " · $(Format-Clock $snap.backup.LastWriteTime) · cifrato" 'muted') } else { V 'nessuno' 'warn' }))
  $security = if ($observability) { $observability.security } else { $null }
  if ($security) {
    $integrity = if ($security.integrity) { V 'integro' 'ok' } else { V 'da verificare' 'warn' }
    $data.rows += , @('Sicurezza', $integrity + (V " · $($security.counts.critical) critici in 24 h" 'muted'))
  }
  $data.rows += , @('Registro server', (V (Format-Bytes $snap.logSize) 'text') + (V " · errori ultima ora: $($snap.errorsLastHour)" $(if ($snap.errorsLastHour) { 'warn' } else { 'muted' })))

  return @{ phase = $phase; left = @($service, $ai, $data); right = @($watch, $net) }
}

#endregion

#region 04 — Disegno

function Get-Size {
  if (-not $interactive) { return @{ width = 118; height = 60 } }
  try { return @{ width = [Math]::Max(60, [Console]::WindowWidth); height = [Math]::Max(20, [Console]::WindowHeight) } } catch { return @{ width = 118; height = 40 } }
}

function Format-Section($Section, [int]$Width) {
  $lines = [Collections.Generic.List[string]]::new()
  $titleText = " $($Section.title) "
  $rule = '─' * [Math]::Max(2, $Width - $titleText.Length - 3)
  $lines.Add((V '──' 'dim') + (V $titleText 'accent') + (V $rule 'dim'))
  $labelWidth = 18
  foreach ($row in $Section.rows) {
    # In @('etichetta', (V a) + (V b)) la virgola lega più del +: i pezzi del valore arrivano separati.
    $value = (@($row | Select-Object -Skip 1) | ForEach-Object { [string]$_ }) -join ''
    $lines.Add('  ' + (V ($row[0].PadRight($labelWidth)) 'muted') + $value)
  }
  $lines.Add('')
  return , $lines.ToArray()
}

function Get-KeyHints {
  $running = $snap.private.state -ne 'offline' -or $snap.listening.Count
  return @(
    @('R', 'riavvia'), @('A', $(if ($running) { 'arresta' } else { 'avvia' })), @('M', 'manutenzione'),
    @('L', 'registro'), @('D', 'diagnostica'), @('W', 'web app'), @('C', 'cartella dati'),
    @('P', 'spegni PC'), @('H', 'guida'), @('Q', 'esci')
  )
}

function Build-Frame {
  $size = Get-Size
  $width = $size.width
  $sections = Get-Sections
  $phase = $sections.phase
  $lines = [Collections.Generic.List[string]]::new()
  $now = Get-Date

  $brand = '  ' + (V '◆' 'violet') + ' ' + (V 'NEXUSNXS' 'text') + (V '  Server Console' 'muted')
  $stamp = $now.ToString('ddd d MMM · HH:mm:ss', $italian)
  $gap = [Math]::Max(2, $width - (Get-Visible $brand).Length - $stamp.Length - 2)
  $lines.Add($brand + (' ' * $gap) + (V $stamp 'muted'))
  $lines.Add('')

  # Indicatore che respira lentamente (ciclo di 2,4 s): la console è viva, senza distrarre.
  $dot = V '●' $phase.tone
  if ($interactive -and $useColor -and $phase.key -in @('ready', 'warming')) {
    $wave = (1 + [Math]::Sin(2 * [Math]::PI * ($now.TimeOfDay.TotalSeconds / 2.4))) / 2
    $dot = (Get-MixedTone $palette[$phase.tone] $palette.dim (0.55 * (1 - $wave))) + '●' + $T.reset
  }
  $hero = '  ' + $dot + '  ' + "$($T.bold)$(V $phase.label $phase.tone)" + (V "   $($phase.detail)" 'text') + (V "   v$version" 'dim')
  $lines.Add($hero)
  if ($toast -and $now -lt $toast.until) { $lines.Add('     ' + (V $toast.text $toast.tone)) } else { $lines.Add('') }
  $lines.Add('')

  if ($width -ge 112) {
    $columnWidth = [int][Math]::Floor(($width - 6) / 2)
    $left = [Collections.Generic.List[string]]::new()
    $right = [Collections.Generic.List[string]]::new()
    foreach ($section in $sections.left) { $left.AddRange([string[]](Format-Section $section $columnWidth)) }
    foreach ($section in $sections.right) { $right.AddRange([string[]](Format-Section $section $columnWidth)) }
    $rows = [Math]::Max($left.Count, $right.Count)
    for ($i = 0; $i -lt $rows; $i++) {
      $l = if ($i -lt $left.Count) { $left[$i] } else { '' }
      $r = if ($i -lt $right.Count) { $right[$i] } else { '' }
      $lines.Add('  ' + (Format-Fit $l $columnWidth -Pad) + '  ' + (Format-Fit $r $columnWidth))
    }
  } else {
    foreach ($section in @($sections.left + $sections.right)) {
      foreach ($line in (Format-Section $section ($width - 4))) { $lines.Add('  ' + $line) }
    }
  }

  $eventTitle = ' EVENTI RECENTI '
  $lines.Add('  ' + (V '──' 'dim') + (V $eventTitle 'accent') + (V ('─' * [Math]::Max(2, $width - $eventTitle.Length - 7)) 'dim'))
  $footerHeight = 4
  $room = [Math]::Max(3, $size.height - $lines.Count - $footerHeight - 1)
  $events = @($snap.events | Select-Object -Last ([Math]::Min($room, 8)))
  if (-not $events.Count) { $lines.Add('    ' + (V 'Nessun evento registrato.' 'muted')) }
  foreach ($event in $events) {
    $tone = switch ($event.level) { 'error' { 'err' } 'warn' { 'warn' } default { 'dim' } }
    $lines.Add('    ' + (V (Format-Clock $event.at.ToLocalTime()) 'muted') + '  ' + (V '●' $tone) + '  ' + (V $event.message $(if ($event.level -eq 'error') { 'err' } else { 'text' })))
  }

  if ($interactive) { while ($lines.Count -lt $size.height - $footerHeight) { $lines.Add('') } } else { $lines.Add('') }
  $hints = ''
  $hintLines = [Collections.Generic.List[string]]::new()
  foreach ($hint in Get-KeyHints) {
    $piece = (V $hint[0] 'accent') + ' ' + (V $hint[1] 'muted') + '    '
    if ((Get-Visible ($hints + $piece)).Length -gt ($width - 4) -and $hints) { $hintLines.Add('  ' + $hints); $hints = '' }
    $hints += $piece
  }
  if ($hints) { $hintLines.Add('  ' + $hints) }
  $lines.Add('  ' + (V ('─' * ($width - 4)) 'dim'))
  foreach ($hintLine in $hintLines) { $lines.Add($hintLine) }
  $lines.Add('  ' + (V 'Chiudere la console non arresta il server: è un servizio separato.' 'dim'))
  return $lines.ToArray()
}

$lastSize = $null
function Write-Frame([string[]]$Lines) {
  $size = Get-Size
  if (-not $interactive) {
    foreach ($line in $Lines) { [Console]::Out.WriteLine((Format-Fit $line $size.width).TrimEnd()) }
    return
  }
  $builder = [Text.StringBuilder]::new()
  if (-not $script:lastSize -or $script:lastSize.width -ne $size.width -or $script:lastSize.height -ne $size.height) { [void]$builder.Append("`e[2J") }
  $script:lastSize = $size
  [void]$builder.Append("`e[H")
  $count = [Math]::Min($Lines.Count, $size.height)
  for ($i = 0; $i -lt $count; $i++) {
    [void]$builder.Append((Format-Fit $Lines[$i] ($size.width - 1))).Append("`e[K")
    if ($i -lt $count - 1) { [void]$builder.Append("`n") }
  }
  [void]$builder.Append("`e[J")
  [Console]::Out.Write($builder.ToString())
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
  if ($interactive) { [Console]::Out.Write("`e[H`e[J") } else { Write-Out '' }
  Write-Out ('  ' + (V '◆' 'violet') + ' ' + (V 'NEXUSNXS' 'text') + (V '  Server Console' 'muted'))
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

$Host.UI.RawUI.WindowTitle = 'NexusNXS · Server Console'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::TreatControlCAsInput = $true
[Console]::Out.Write("`e[?1049h`e[?25l`e[H`e[2J")
try {
  Write-Out ''
  Write-Out ('  ' + (V '◆' 'violet') + ' ' + (V 'NEXUSNXS' 'text') + (V '  lettura dello stato…' 'muted'))
  Update-Snapshot -Force
  $phase = Get-ServerPhase
  if (-not $NoAutoStart -and $phase.key -eq 'offline' -and -not $snap.ownerStopSince -and
      $snap.tasks['NexusNXS Server'] -and [string]$snap.tasks['NexusNXS Server'].State -ne 'Running') {
    # Accensione senza server attivo: avvio coordinato in background, la console resta reattiva.
    $jobs.start = Start-ThreadJob -ScriptBlock { param($Pwsh, $Manager) & $Pwsh -NoLogo -NoProfile -NonInteractive -File $Manager -Action start *>&1 | Out-Null } -ArgumentList $pwshPath, $ManagerPath
    Set-Toast 'Server non attivo: avvio coordinato richiesto.' 'warn'
  }
  $running = $true
  while ($running) {
    Update-Snapshot
    Write-Frame (Build-Frame)
    $deadline = [DateTime]::UtcNow.AddMilliseconds(250)
    while ([DateTime]::UtcNow -lt $deadline) {
      if ([Console]::KeyAvailable) { Invoke-ConsoleKey (Read-ConsoleKey); break }
      Start-Sleep -Milliseconds 25
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
  [Console]::TreatControlCAsInput = $false
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}

#endregion
