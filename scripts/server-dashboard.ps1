<#
  @module scripts/server-dashboard
  @description Shows server health, latency, active clients and private-network peers in PowerShell 7.
#>
param(
  [ValidateRange(1, 60)][int]$RefreshSeconds = 2,
  [ValidateRange(5, 300)][int]$PingRefreshSeconds = 15,
  [switch]$Once
)

$ErrorActionPreference = 'SilentlyContinue'
$taskName = 'NexusNXS Server'
$legacyTaskName = 'Nexus AI Server'
$gatewayPort = 32145
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataRoot = Join-Path (Split-Path $projectRoot -Parent) '.nexus-data'
$logPath = Join-Path $dataRoot 'logs\nexus.log'
$securityLogPath = Join-Path $dataRoot 'data\logs\security-audit.jsonl'
$sloReportPath = Join-Path $projectRoot 'qa-artifacts\product-slo-report.json'
$Host.UI.RawUI.WindowTitle = 'NexusNXS Server Monitor'
$pingCache = @{}
$lastPingRefresh = [datetime]::MinValue
$publicCache = @()
$lastPublicRefresh = [datetime]::MinValue

#region 01 — Raccolta diagnostica

function Get-GatewayHealth {
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $status = (Invoke-RestMethod "http://127.0.0.1:$gatewayPort/healthz" -TimeoutSec 2).status
    $timer.Stop()
    return [pscustomobject]@{ Status = $status; LatencyMs = $timer.ElapsedMilliseconds }
  } catch {
    $timer.Stop()
    return [pscustomobject]@{ Status = 'offline'; LatencyMs = $null }
  }
}

function Get-PrivateObservability {
  try {
    # Il primo snapshot dopo un riavvio include WMI/GPU e può richiedere alcuni
    # secondi; le letture successive usano la cache del gateway.
    return Invoke-RestMethod "http://127.0.0.1:$gatewayPort/internal/observability" -TimeoutSec 12
  } catch {
    return $null
  }
}

function Get-PublicIngressHealth {
  $checks = @(
    @{ Name = 'site'; Url = 'https://nexusnxs.com/' },
    @{ Name = 'ai-live'; Url = 'https://ai.nexusnxs.com/healthz' },
    @{ Name = 'ai-ready'; Url = 'https://ai.nexusnxs.com/readyz' }
  )
  @($checks | ForEach-Object {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
      $response = Invoke-WebRequest -Uri $_.Url -MaximumRedirection 3 -TimeoutSec 5
      $timer.Stop()
      [pscustomobject]@{ Name = $_.Name; Status = [int]$response.StatusCode; LatencyMs = $timer.ElapsedMilliseconds; Edge = [string]$response.Headers['Server'] }
    } catch {
      $timer.Stop()
      [pscustomobject]@{ Name = $_.Name; Status = 0; LatencyMs = $timer.ElapsedMilliseconds; Edge = 'offline' }
    }
  })
}

function Get-InstalledTaskName {
  foreach ($candidate in @($taskName, $legacyTaskName)) {
    if (Get-ScheduledTask -TaskName $candidate -ErrorAction SilentlyContinue) { return $candidate }
  }
  return $taskName
}

function Get-ActiveConnections {
  @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $gatewayPort -or $_.RemotePort -eq $gatewayPort } |
    ForEach-Object {
      $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      [pscustomobject]@{
        RemoteIP = $_.RemoteAddress
        RemotePort = $_.RemotePort
        LocalIP = $_.LocalAddress
        Process = if ($process) { $process.ProcessName } else { '-' }
      }
    } |
    Sort-Object RemoteIP, RemotePort -Unique)
}

function Get-TailscalePeers {
  if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) { return @() }
  $status = tailscale status --json 2>$null | ConvertFrom-Json
  if (-not $status) { return @() }
  $items = @()
  foreach ($property in $status.Peer.PSObject.Properties) {
    $peer = $property.Value
    $ip = @($peer.TailscaleIPs)[0]
    $items += [pscustomobject]@{
      Name = if ($peer.HostName) { $peer.HostName } else { $peer.DNSName.TrimEnd('.') }
      IP = $ip
      Online = [bool]$peer.Online
      LastSeen = if ($peer.Online) { 'now' } elseif ($peer.LastSeen) { ([datetime]$peer.LastSeen).ToLocalTime().ToString('dd/MM HH:mm') } else { '-' }
      PingMs = $pingCache[$ip]
    }
  }
  return @($items | Sort-Object @{e='Online';Descending=$true}, Name)
}

function Update-PeerPings([object[]]$Peers) {
  foreach ($peer in @($Peers | Where-Object Online | Select-Object -First 8)) {
    $result = (tailscale ping --c 1 --timeout 2s $peer.IP 2>&1) -join ' '
    $latency = [regex]::Match($result, '\bin\s+(\d+(?:\.\d+)?)ms\b')
    $pingCache[$peer.IP] = if ($latency.Success) { [math]::Round([double]$latency.Groups[1].Value, 1) } else { $null }
  }
}

function Get-RecentSecurityClients {
  if (-not (Test-Path -LiteralPath $securityLogPath)) { return @() }
  @(Get-Content -LiteralPath $securityLogPath -Tail 100 |
    ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
    Where-Object { $_ -and ($_.address -or $_.deviceName) } |
    Select-Object -Last 8 |
    ForEach-Object {
      [pscustomobject]@{
        Time = if ($_.at) { [DateTimeOffset]::FromUnixTimeMilliseconds([long]$_.at).LocalDateTime.ToString('dd/MM HH:mm:ss') } else { '-' }
        Event = $_.type
        Address = if ($_.address) { $_.address } else { '-' }
        Device = if ($_.deviceName) { $_.deviceName } else { '-' }
      }
    })
}

function Get-FunnelStatus {
  if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) {
    return [pscustomobject]@{ Status = 'not installed'; Url = '-' }
  }
  $status = tailscale status --json 2>$null | ConvertFrom-Json
  $dnsName = String($status.Self.DNSName).TrimEnd('.')
  $config = (tailscale funnel status 2>$null) -join [Environment]::NewLine
  [pscustomobject]@{
    Status = if ($config -match ':8443') { 'online' } else { 'offline' }
    Url = if ($dnsName) { "https://$dnsName`:8443" } else { '-' }
  }
}

function Get-SloStatus {
  if (-not (Test-Path -LiteralPath $sloReportPath)) {
    return [pscustomobject]@{ Status = 'not measured'; Summary = 'run npm run slo:check'; Updated = '-' }
  }
  try {
    $report = Get-Content -LiteralPath $sloReportPath -Raw | ConvertFrom-Json
    $summary = $report.summary
    return [pscustomobject]@{
      Status = if ($report.releaseReady) { 'ready' } else { 'attention' }
      Summary = "pass $($summary.pass) / fail $($summary.fail) / pending $($summary.notMeasured)"
      Updated = if ($report.generatedAt) { ([datetime]$report.generatedAt).ToLocalTime().ToString('dd/MM HH:mm') } else { '-' }
    }
  } catch {
    return [pscustomobject]@{ Status = 'invalid'; Summary = 'report unreadable'; Updated = '-' }
  }
}

#endregion

#region 02 — Monitor live

while ($true) {
  $installedTaskName = Get-InstalledTaskName
  $task = Get-ScheduledTask -TaskName $installedTaskName
  $taskInfo = Get-ScheduledTaskInfo -TaskName $installedTaskName
  $listener = Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq $gatewayPort | Select-Object -First 1
  $health = Get-GatewayHealth
  $observability = Get-PrivateObservability
  $connections = Get-ActiveConnections
  $recentClients = Get-RecentSecurityClients
  $funnel = Get-FunnelStatus
  $slo = Get-SloStatus
  $peers = Get-TailscalePeers
  if (((Get-Date) - $lastPublicRefresh).TotalSeconds -ge $PingRefreshSeconds) {
    $publicCache = @(Get-PublicIngressHealth)
    $lastPublicRefresh = Get-Date
  }
  if (((Get-Date) - $lastPingRefresh).TotalSeconds -ge $PingRefreshSeconds) {
    Update-PeerPings $peers
    $lastPingRefresh = Get-Date
    $peers = Get-TailscalePeers
  }
  $server = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'electron.exe' -and $_.CommandLine -like '*--server*') -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*start-electron.js*--server*')
  }
  $serverIds = @($server.ProcessId | Where-Object { [int]$_ -gt 0 })
  $gatewayOwnerId = if ($listener -and [int]$listener.OwningProcess -gt 0) { [int]$listener.OwningProcess } else { 0 }
  $reportedIds = @($serverIds + $gatewayOwnerId | Where-Object { [int]$_ -gt 0 } | Sort-Object -Unique)
  $processes = if ($reportedIds.Count) {
    Get-Process -Id $reportedIds | Select-Object Id, ProcessName,
      @{n='Role';e={if ($_.Id -eq $gatewayOwnerId) { 'gateway' } else { 'runtime' }}},
      @{n='RAM_MB';e={[math]::Round($_.WorkingSet64 / 1MB, 1)}},
      @{n='CPU_s';e={[math]::Round($_.CPU, 1)}}
  } else { @() }
  $tailscale = Get-Service Tailscale
  $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($projectRoot).TrimEnd(':\'))
  $recentLogs = if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Tail 4 } else { @('No log available.') }
  $taskResult = if (-not $taskInfo) { '-' } elseif ($taskInfo.LastTaskResult -eq 267009) { 'running' } elseif ($taskInfo.LastTaskResult -eq 0) { 'success' } else { "error 0x$('{0:X8}' -f $taskInfo.LastTaskResult)" }

  Clear-Host
  Write-Host 'NEXUSNXS SERVER' -ForegroundColor Cyan
  Write-Host ('Updated {0:HH:mm:ss} · refresh {1}s · PowerShell {2} · Ctrl+C closes only this monitor' -f (Get-Date), $RefreshSeconds, $PSVersionTable.PSVersion) -ForegroundColor DarkGray
  Write-Host ''
  Write-Host ('Health       {0} · {1}' -f $health.Status, $(if ($null -ne $health.LatencyMs) { "$($health.LatencyMs) ms" } else { 'no response' })) -ForegroundColor $(if ($health.Status -eq 'ok') { 'Green' } else { 'Red' })
  Write-Host ('Task         {0} · {1}' -f $(if ($task) { $task.State } else { 'not installed' }), $taskResult)
  Write-Host ('Gateway      {0}' -f $(if ($listener) { "$($listener.LocalAddress):$($listener.LocalPort)" } else { 'offline' }))
  Write-Host ('Tailscale    {0} / {1}' -f $(if ($tailscale) { $tailscale.Status } else { 'not installed' }), $(if ($tailscale) { $tailscale.StartType } else { '-' }))
  Write-Host ('Funnel       {0} · {1}' -f $funnel.Status, $funnel.Url) -ForegroundColor $(if ($funnel.Status -eq 'online') { 'Green' } else { 'DarkGray' })
  Write-Host ('SLO evidence {0} · {1} · {2}' -f $slo.Status, $slo.Summary, $slo.Updated) -ForegroundColor $(if ($slo.Status -eq 'ready') { 'Green' } elseif ($slo.Status -eq 'attention') { 'Yellow' } else { 'DarkGray' })
  Write-Host ('SSD free     {0} GB' -f [math]::Round($drive.Free / 1GB, 1))
  Write-Host ''

  Write-Host 'PRIVATE OBSERVABILITY' -ForegroundColor Cyan
  if ($observability) {
    $performance = $observability.performance
    $requests = $observability.requests
    $system = $observability.system
    $security = $observability.security
    Write-Host ('Latency      P50 {0} ms · P95 {1} ms · P99 {2} ms · first token P95 {3} ms' -f $performance.p50Ms, $performance.p95Ms, $performance.p99Ms, $performance.firstTokenP95Ms)
    Write-Host ('Queue        active {0}/{1} · waiting {2}/{3}' -f $requests.active, $requests.concurrency, $requests.queued, $requests.queueLimit)
    Write-Host ('Load         CPU {0}% · RAM {1}% · GPU {2}%' -f $system.cpuPercent, $system.memoryPercent, $system.gpuPercent)
    Write-Host ('Security     {0} · journal {1} · warnings {2} · critical {3}' -f $security.status, $(if ($security.integrity) { 'valid' } else { 'attention' }), $security.counts.warnings, $security.counts.critical)
    if (@($security.accesses).Count) {
      @($security.accesses | Select-Object -First 6 | ForEach-Object {
        [pscustomobject]@{ Time = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$_.at).LocalDateTime.ToString('HH:mm:ss'); Client = $_.client; Event = $_.event; Severity = $_.severity }
      }) | Format-Table -AutoSize | Out-Host
    } else { Write-Host 'No recent pseudonymized access.' -ForegroundColor DarkGray; Write-Host '' }
  } else { Write-Host 'Aggregate telemetry unavailable.' -ForegroundColor DarkGray; Write-Host '' }

  Write-Host 'PUBLIC INGRESS' -ForegroundColor Cyan
  if ($publicCache.Count) { $publicCache | Format-Table -AutoSize | Out-Host } else { Write-Host 'Public checks unavailable.' -ForegroundColor DarkGray; Write-Host '' }

  Write-Host 'ACTIVE CONNECTIONS' -ForegroundColor Cyan
  if ($connections.Count) { $connections | Format-Table -AutoSize | Out-Host } else { Write-Host 'No active gateway client.' -ForegroundColor DarkGray; Write-Host '' }
  Write-Host 'RECENT CLIENT EVENTS' -ForegroundColor Cyan
  if ($recentClients.Count) { $recentClients | Format-Table -AutoSize | Out-Host } else { Write-Host 'No authenticated or rejected client event.' -ForegroundColor DarkGray; Write-Host '' }
  Write-Host 'TAILSCALE DEVICES' -ForegroundColor Cyan
  if ($peers.Count) {
    $peers | Select-Object Name, IP, Online, LastSeen, @{n='PingMs';e={$_.PingMs}} | Format-Table -AutoSize | Out-Host
  } else { Write-Host 'No Tailscale peer available.' -ForegroundColor DarkGray; Write-Host '' }
  Write-Host 'SERVER PROCESSES' -ForegroundColor Cyan
  if ($processes) { $processes | Format-Table -AutoSize | Out-Host } else { Write-Host 'No server process.' -ForegroundColor Red; Write-Host '' }
  Write-Host 'RECENT EVENTS' -ForegroundColor Cyan
  $recentLogs | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
  if ($Once) { break }
  Start-Sleep -Seconds $RefreshSeconds
}

#endregion
