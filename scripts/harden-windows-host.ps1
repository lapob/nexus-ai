# @module scripts/harden-windows-host
# @description Audita e, con elevazione esplicita, restringe soltanto superfici Windows riconducibili a NexusNXS e ADB.
param(
  [ValidateSet('Audit', 'Apply')]
  [string]$Action = 'Audit',
  [switch]$DisableUnusedWinRM,
  [switch]$DisableUnusedIIS
)

$ErrorActionPreference = 'Stop'
$hostIsWindows = $env:OS -eq 'Windows_NT'
if (-not $hostIsWindows) { throw 'Questo controllo è disponibile soltanto su Windows.' }

#region 01 — Inventario confinato

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ProgramRules {
  $rows = @()
  $filters = Get-NetFirewallApplicationFilter -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
    Where-Object { $_.Program }
  foreach ($filter in $filters) {
    foreach ($rule in @(Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $filter -ErrorAction SilentlyContinue)) {
      $rows += [pscustomobject]@{ Rule = $rule; Program = [string]$filter.Program }
    }
  }
  return $rows
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$portableAdb = Join-Path (Split-Path -Parent $projectRoot) '.toolchains\android-sdk\platform-tools\adb.exe'
$programRules = @(Get-ProgramRules)
$obsolete = @($programRules | Where-Object {
  $program = $_.Program
  ($program -match '(?i)\\Nexus\\\.AI\\') -or
  ($program -match '(?i)\\NexusNXS\\\.AI\\node_modules\\electron\\dist\\electron\.exe$') -or
  (($program -match '(?i)\\android\\sdk\\platform-tools\\adb\.exe$') -and -not (Test-Path -LiteralPath $program -PathType Leaf))
})
$portableAdbRules = @($programRules | Where-Object {
  [System.IO.Path]::GetFullPath($_.Program).TrimEnd('\') -ieq [System.IO.Path]::GetFullPath($portableAdb).TrimEnd('\')
})

$services = foreach ($name in 'WinRM', 'W3SVC') {
  $service = Get-Service -Name $name -ErrorAction SilentlyContinue
  if ($service) { [pscustomobject]@{ Name = $name; Status = [string]$service.Status; StartType = [string]$service.StartType } }
}
$dedicated = @(Get-NetFirewallRule -DisplayName 'Nexus Remote Tailscale' -ErrorAction SilentlyContinue)
$summary = [pscustomobject]@{
  Action = $Action
  Administrator = Test-Administrator
  ObsoleteOrBroadNexusRules = $obsolete.Count
  PortableAdbRules = $portableAdbRules.Count
  DedicatedTailscaleRule = $dedicated.Count
  Services = @($services)
}

#endregion
#region 02 — Audit o hardening esplicito

if ($Action -eq 'Audit') {
  $summary | ConvertTo-Json -Depth 5
  exit 0
}

if (-not (Test-Administrator)) {
  throw 'Apri PowerShell 7 come amministratore e ripeti con -Action Apply.'
}

foreach ($entry in $obsolete) {
  Remove-NetFirewallRule -Name $entry.Rule.Name -ErrorAction Stop
}

foreach ($entry in $portableAdbRules) {
  Set-NetFirewallRule -Name $entry.Rule.Name -Profile Private -Action Allow -Direction Inbound -Enabled True
  Set-NetFirewallAddressFilter -AssociatedNetFirewallRule $entry.Rule -RemoteAddress LocalSubnet
}

Get-NetFirewallRule -DisplayName 'Nexus Remote Tailscale' -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule -ErrorAction Stop
New-NetFirewallRule -DisplayName 'Nexus Remote Tailscale' -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 32145 -RemoteAddress '100.64.0.0/10' -Profile Any | Out-Null

if ($DisableUnusedWinRM) {
  Stop-Service -Name WinRM -Force -ErrorAction SilentlyContinue
  Set-Service -Name WinRM -StartupType Disabled
}
if ($DisableUnusedIIS) {
  Stop-Service -Name W3SVC -Force -ErrorAction SilentlyContinue
  Set-Service -Name W3SVC -StartupType Disabled
}

[pscustomobject]@{
  Applied = $true
  RemovedRules = $obsolete.Count
  RestrictedAdbRules = $portableAdbRules.Count
  DisabledWinRM = [bool]$DisableUnusedWinRM
  DisabledIIS = [bool]$DisableUnusedIIS
} | ConvertTo-Json -Depth 4

#endregion
