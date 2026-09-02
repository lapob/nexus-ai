---
title: DNS, DHCP, routing, VPN e servizi di rete
type: reference
area: networking
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: official-docs
tags: [dns, dhcp, routing, vpn]
aliases: [Comandi servizi di rete]
---

# DNS, DHCP, routing, VPN e servizi di rete

## Windows

```powershell
Get-NetIPConfiguration
Get-NetRoute | Sort-Object RouteMetric
Get-DnsClientServerAddress
Resolve-DnsName example.org -Type A
Resolve-DnsName example.org -Type MX
Get-DnsClientCache
ipconfig.exe /all
route.exe print
Get-NetTCPConnection
Test-NetConnection host -Port 443 -InformationLevel Detailed
Get-VpnConnection
```

## Linux

```bash
ip -br address
ip route
ip rule
ss -lntup
resolvectl status
resolvectl query example.org
dig +trace example.org
nmcli connection show
ethtool eth0
tracepath destinazione
mtr -rw destinazione
curl -v --connect-timeout 5 https://example.org/
openssl s_client -connect example.org:443 -servername example.org
```

Controllare: link → indirizzo → route → DNS → trasporto → TLS → applicazione.
