---
title: IPv6, routing, firewall, VPN e diagnostica avanzata
type: technical-guide
area: networking
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [ipv6, routing, firewall, vpn, diagnostics]
aliases: [Networking avanzato]
---

# IPv6, routing, firewall, VPN e diagnostica avanzata

## IPv6

IPv6 usa indirizzi a 128 bit, Neighbor Discovery e ICMPv6. Tipi comuni:

- global unicast `2000::/3`;
- link-local `fe80::/10`;
- unique local `fc00::/7`;
- multicast `ff00::/8`;
- loopback `::1`.

La prefix length sostituisce la netmask. Un host può avere più indirizzi ottenuti tramite SLAAC, DHCPv6 o configurazione statica.

```bash
ip -6 address
ip -6 route
ip -6 neigh
ping -6 host
traceroute -6 host
```

```powershell
Get-NetIPAddress -AddressFamily IPv6
Get-NetRoute -AddressFamily IPv6
Get-NetNeighbor -AddressFamily IPv6
Test-NetConnection host -Port 443
```

Non disabilitare IPv6 per nascondere un problema: molte piattaforme lo assumono disponibile.

## Routing

Il router sceglie il prefisso più specifico, poi applica metriche e policy. Distingui connected, static, default e route apprese dinamicamente.

```bash
ip route get 192.0.2.10
ip rule
ip route show table all
traceroute -T -p 443 host
```

Asymmetric routing può rompere firewall stateful e rendere le catture incomplete.

## Firewall

Policy in ingresso, uscita e forwarding sono distinte. Documenta zona, interfaccia, protocollo, direzione, stato, sorgente e destinazione.

```bash
nft list ruleset
iptables-save
firewall-cmd --list-all
Get-NetFirewallProfile
Get-NetFirewallRule -Enabled True
```

Prima di applicare regole remote mantieni accesso out-of-band o rollback temporizzato.

## VPN

Site-to-site collega reti; remote access collega endpoint; full tunnel e split tunnel cambiano route e DNS. Controlla autenticazione, cifratura, MTU, keepalive, route, DNS e overlapping subnet.

```bash
ip link
wg show
ipsec statusall
route print
```

## MTU e PMTUD

Un MTU errato causa connessioni parziali: handshake riuscito ma trasferimenti bloccati.

```bash
ping -M do -s 1472 host
tracepath host
```

Su IPv6 i router non frammentano: ICMPv6 Packet Too Big è essenziale.

## Scenario tecnico
Costruisci tre subnet virtuali dual-stack, configura routing e firewall minimo, misura il percorso, crea una regola errata controllata, diagnosticala con route, state e packet capture, poi documenta rollback.

## Collegamenti

- [[Fondamenti di rete]]
- [[Diagnostica e analisi di rete]]
- [[DNS DHCP PKI e troubleshooting dei servizi di rete]]
