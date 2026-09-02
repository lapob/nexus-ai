<#
  @module scripts/audit-connections
  @description Verifica locale e non invasiva di ingressi pubblici, privati e listener NexusNXS.
#>
param(
  [switch]$Json,
  [switch]$Strict,
  [ValidateRange(1, 30)][int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'SilentlyContinue'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$gatewayPort = 32145
$publicChecks = @(
  @{ Name = 'Sito'; Url = 'https://nexusnxs.com/' },
  @{ Name = 'AI liveness'; Url = 'https://ai.nexusnxs.com/healthz' },
  @{ Name = 'AI readiness'; Url = 'https://ai.nexusnxs.com/readyz' }
)

#region 01 — Raccolta diagnostica

function Test-HttpEndpoint([string]$Name, [string]$Url) {
  $timer = [Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest -Uri $Url -MaximumRedirection 3 -TimeoutSec $TimeoutSeconds
    $timer.Stop()
    [pscustomobject]@{
      Name = $Name; Url = $Url; Status = [int]$response.StatusCode
      LatencyMs = $timer.ElapsedMilliseconds
      Edge = [string]$response.Headers['Server']
      RequestId = [string]$response.Headers['CF-RAY']
    }
  } catch {
    $timer.Stop()
    [pscustomobject]@{ Name = $Name; Url = $Url; Status = 0; LatencyMs = $timer.ElapsedMilliseconds; Edge = ''; RequestId = ''; Error = $_.Exception.Message }
  }
}

function Get-DnsState {
  foreach ($name in @('nexusnxs.com', 'ai.nexusnxs.com')) {
    $addresses = @(Resolve-DnsName -Name $name -Type A | Where-Object IPAddress | Select-Object -ExpandProperty IPAddress -Unique)
    [pscustomobject]@{ Name = $name; Addresses = @($addresses) }
  }
}

function Get-NexusListeners {
  @(Get-NetTCPConnection -State Listen |
    Where-Object { $_.LocalPort -in @($gatewayPort, 32146) } |
    ForEach-Object {
      $process = Get-Process -Id $_.OwningProcess
      [pscustomobject]@{
        Address = $_.LocalAddress; Port = $_.LocalPort
        Exposure = if ($_.LocalAddress -in @('127.0.0.1', '::1')) { 'localhost' } else { 'network' }
        Process = if ($process) { $process.ProcessName } else { 'unknown' }
        PID = $_.OwningProcess
      }
    })
}

function Get-ActiveGatewayConnections {
  @(Get-NetTCPConnection -State Established |
    Where-Object { $_.LocalPort -eq $gatewayPort -or $_.RemotePort -eq $gatewayPort } |
    ForEach-Object {
      $process = Get-Process -Id $_.OwningProcess
      $remote = [string]$_.RemoteAddress
      $zone = if ($remote -in @('127.0.0.1', '::1')) { 'localhost' }
        elseif ($remote -like '100.*') { 'tailscale' }
        elseif ($remote -like '10.*' -or $remote -like '192.168.*' -or $remote -match '^172\.(1[6-9]|2\d|3[01])\.') { 'lan' }
        else { 'internet' }
      [pscustomobject]@{ RemoteAddress = $remote; RemotePort = $_.RemotePort; Zone = $zone; Process = if ($process) { $process.ProcessName } else { 'unknown' } }
    } | Sort-Object RemoteAddress, RemotePort -Unique)
}

function Get-TailscaleState {
  if (-not (Get-Command tailscale.exe)) { return [pscustomobject]@{ Installed = $false; State = 'not-installed'; Self = ''; IPs = @(); OnlinePeers = 0 } }
  $status = tailscale status --json 2>$null | ConvertFrom-Json
  if (-not $status) { return [pscustomobject]@{ Installed = $true; State = 'unavailable'; Self = ''; IPs = @(); OnlinePeers = 0 } }
  $online = @($status.Peer.PSObject.Properties | Where-Object { $_.Value.Online }).Count
  [pscustomobject]@{ Installed = $true; State = [string]$status.BackendState; Self = ([string]$status.Self.DNSName).TrimEnd('.'); IPs = @($status.Self.TailscaleIPs); OnlinePeers = $online }
}

function Get-FirewallState {
  @(Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction)
}

#endregion
#region 02 — Report e gate rigoroso

$report = [ordered]@{
  GeneratedAt = (Get-Date).ToString('o')
  ProjectRoot = $projectRoot
  Public = @($publicChecks | ForEach-Object { Test-HttpEndpoint $_.Name $_.Url })
  Dns = @(Get-DnsState)
  LocalGateway = Test-HttpEndpoint 'Gateway locale' "http://127.0.0.1:$gatewayPort/readyz"
  Listeners = @(Get-NexusListeners)
  Connections = @(Get-ActiveGatewayConnections)
  Tailscale = Get-TailscaleState
  Firewall = @(Get-FirewallState)
}

if ($Json) {
  $report | ConvertTo-Json -Depth 6
  if ($Strict) {
    $publicReady = @($report.Public | Where-Object { $_.Status -ge 200 -and $_.Status -lt 300 }).Count -eq $report.Public.Count
    $localReady = $report.LocalGateway.Status -ge 200 -and $report.LocalGateway.Status -lt 300
    $privateReady = -not $report.Tailscale.Installed -or $report.Tailscale.State -eq 'Running'
    if (-not ($publicReady -and $localReady -and $privateReady)) { exit 2 }
  }
  exit 0
}

Write-Host 'NEXUSNXS CONNECTION AUDIT' -ForegroundColor Cyan
Write-Host ('Generated {0}' -f $report.GeneratedAt) -ForegroundColor DarkGray
Write-Host ''
$report.Public | Select-Object Name, Status, LatencyMs, Edge, Url | Format-Table -AutoSize
Write-Host 'LOCAL GATEWAY' -ForegroundColor Cyan
$report.LocalGateway | Select-Object Status, LatencyMs, Url, Error | Format-Table -AutoSize
Write-Host 'NEXUS LISTENERS' -ForegroundColor Cyan
if ($report.Listeners.Count) { $report.Listeners | Format-Table -AutoSize } else { Write-Host 'No NexusNXS listener.' -ForegroundColor DarkGray }
Write-Host 'ACTIVE GATEWAY CONNECTIONS' -ForegroundColor Cyan
if ($report.Connections.Count) { $report.Connections | Format-Table -AutoSize } else { Write-Host 'No active client.' -ForegroundColor DarkGray }
Write-Host 'TAILSCALE' -ForegroundColor Cyan
$report.Tailscale | Format-List
Write-Host 'WINDOWS FIREWALL' -ForegroundColor Cyan
$report.Firewall | Format-Table -AutoSize

if ($Strict) {
  $publicReady = @($report.Public | Where-Object { $_.Status -ge 200 -and $_.Status -lt 300 }).Count -eq $report.Public.Count
  $localReady = $report.LocalGateway.Status -ge 200 -and $report.LocalGateway.Status -lt 300
  $privateReady = -not $report.Tailscale.Installed -or $report.Tailscale.State -eq 'Running'
  if (-not ($publicReady -and $localReady -and $privateReady)) {
    Write-Error 'Una o più superfici NexusNXS non sono raggiungibili.'
    exit 2
  }
}

#endregion
