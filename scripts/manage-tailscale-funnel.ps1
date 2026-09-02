<#
  @module scripts/manage-tailscale-funnel
  @description Publishes only the loopback NexusNXS public guest listener through Tailscale Funnel.
#>
param(
  [ValidateSet('enable', 'disable', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$tailscale = (Get-Command tailscale.exe -ErrorAction Stop).Source
$curl = (Get-Command curl.exe -ErrorAction Stop).Source
$publicPort = 32147
$publicTarget = 'http://127.0.0.1:32147'
$httpsPort = 8443
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$endpointConfig = Join-Path $projectRoot 'config\android-endpoints.local.properties'

#region 01 — Rilevamento e verifica pubblica

function Get-FunnelUrl {
  $status = & $tailscale status --json 2>$null | ConvertFrom-Json
  $dnsName = ([string]$status.Self.DNSName).TrimEnd('.')
  if ($dnsName -notmatch '^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$') {
    throw 'Tailscale non ha restituito un nome MagicDNS valido.'
  }
  return "https://$dnsName`:$httpsPort"
}

function Test-PublicListener {
  try { return (Invoke-RestMethod "http://127.0.0.1:$publicPort/healthz" -TimeoutSec 3).status -eq 'ok' }
  catch { return $false }
}

function Get-PublicRelayAddresses([string]$DnsName) {
  $providers = @(
    @{ Uri = "https://dns.google/resolve?name=$DnsName&type=A"; Headers = @{} },
    @{ Uri = "https://cloudflare-dns.com/dns-query?name=$DnsName&type=A"; Headers = @{ Accept = 'application/dns-json' } }
  )
  foreach ($provider in $providers) {
    try {
      $result = Invoke-RestMethod -Uri $provider.Uri -Headers $provider.Headers -TimeoutSec 5
      if ([int]$result.Status -ne 0) { continue }
      $addresses = @($result.Answer | Where-Object { [int]$_.type -eq 1 } | ForEach-Object { [string]$_.data }) |
        Where-Object { $_ -match '^(?:\d{1,3}\.){3}\d{1,3}$' } |
        Select-Object -Unique
      if ($addresses.Count -gt 0) { return $addresses }
    } catch { continue }
  }
  return @()
}

function Test-PublicFunnel([string]$Url) {
  $uri = [Uri]$Url
  $addresses = @(Get-PublicRelayAddresses $uri.DnsSafeHost)
  if ($addresses.Count -eq 0) {
    return [pscustomobject]@{ Dns = 'missing'; Health = 'unreachable' }
  }
  foreach ($address in $addresses) {
    try {
      $payload = & $curl --silent --show-error --fail --connect-timeout 5 --max-time 10 `
        --resolve "$($uri.DnsSafeHost):$($uri.Port):$address" "$Url/healthz" 2>$null
      if ($LASTEXITCODE -eq 0 -and ($payload | ConvertFrom-Json).status -eq 'ok') {
        return [pscustomobject]@{ Dns = 'ready'; Health = 'ok' }
      }
    } catch { continue }
  }
  return [pscustomobject]@{ Dns = 'ready'; Health = 'unreachable' }
}

#endregion
#region 02 — Configurazione client

function Update-AndroidFallbackEndpoint([string]$Url) {
  if (-not (Test-Path -LiteralPath $endpointConfig)) { return }
  $lines = Get-Content -LiteralPath $endpointConfig
  $updated = $false
  $lines = $lines | ForEach-Object {
    if ($_ -match '^NEXUS_FALLBACK_URL=') { $updated = $true; "NEXUS_FALLBACK_URL=$Url" } else { $_ }
  }
  if (-not $updated) { $lines += "NEXUS_FALLBACK_URL=$Url" }
  $lines | Set-Content -LiteralPath $endpointConfig -Encoding utf8
}

#endregion
#region 03 — Azioni CLI

if ($Action -eq 'disable') {
  & $tailscale funnel --https=$httpsPort off
  if ($LASTEXITCODE -ne 0) { throw 'Tailscale Funnel non è stato disattivato.' }
  Write-Output 'Ingresso pubblico NexusNXS per Android disattivato. Tailscale Serve privato resta invariato.'
  exit 0
}

if ($Action -eq 'enable') {
  if (-not (Test-PublicListener)) {
    throw "Il listener pubblico NexusNXS non è pronto su 127.0.0.1:$publicPort. Riavvia prima il server NexusNXS."
  }
  & $tailscale funnel --yes --bg --https=$httpsPort $publicTarget
  if ($LASTEXITCODE -ne 0) { throw 'Tailscale Funnel non è stato abilitato.' }
  $url = Get-FunnelUrl
  # Il dominio di prodotto resta l'origine primaria. Funnel è un percorso di
  # continuità temporaneo e non deve riscrivere l'identità pubblica dei client.
  Update-AndroidFallbackEndpoint $url
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $public = Test-PublicFunnel $url
  } while ($public.Health -ne 'ok' -and (Get-Date) -lt $deadline)
  if ($public.Health -ne 'ok') {
    throw "Funnel configurato, ma non raggiungibile da Internet (DNS: $($public.Dns), HTTPS: $($public.Health))."
  }
  Write-Output "NexusNXS per Android pubblico disponibile su $url"
  Write-Output 'NexusNXS per PC e le API amministrative restano sul Tailscale Serve privato.'
  exit 0
}

$url = Get-FunnelUrl
$funnelStatus = (& $tailscale funnel status 2>$null) -join [Environment]::NewLine
$configured = $funnelStatus -match ":$httpsPort"
$public = if ($configured) { Test-PublicFunnel $url } else { [pscustomobject]@{ Dns = 'missing'; Health = 'unreachable' } }
[pscustomobject]@{
  PublicListener = if (Test-PublicListener) { 'ok' } else { 'offline' }
  PublicUrl = $url
  PublicDns = $public.Dns
  PublicHealth = $public.Health
  Funnel = if (-not $configured) { 'offline' } elseif ($public.Health -eq 'ok') { 'online' } else { 'configured' }
  PrivateServe = ((& $tailscale serve status 2>$null) -join [Environment]::NewLine)
} | Format-List

#endregion
