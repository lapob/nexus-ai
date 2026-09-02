---
title: OSPF, BGP, DNSSEC e architetture di rete enterprise
type: technical-guide
area: networking
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [ospf, bgp, dnssec, enterprise-networking, routing]
aliases: [Routing enterprise]
---

# OSPF, BGP, DNSSEC e architetture di rete enterprise

## Routing dinamico

Un protocollo di routing distribuisce reachability, non traffico applicativo. La forwarding table risultante decide il next hop; control plane e data plane vanno diagnosticati separatamente.

## OSPF

OSPF è link-state e usa aree. I router costruiscono un link-state database e calcolano shortest path. Concetti:

- router ID;
- neighbor adjacency;
- hello/dead timer;
- area 0 backbone;
- DR/BDR su reti multi-access;
- cost;
- LSA e route intra/inter/external;
- summarization e authentication.

```text
show ip ospf neighbor
show ip ospf database
show ip route ospf
show ip ospf interface
```

Se manca una route, controlla prima adjacency, area, network type, timer, MTU e LSA; poi policy e forwarding.

## BGP

BGP è path-vector e applica policy. eBGP collega autonomous system; iBGP distribuisce route interne all’AS.

Attributi comuni: AS_PATH, NEXT_HOP, LOCAL_PREF, MED, community e origin. La best path dipende dall’implementazione e dalla policy.

```text
show bgp summary
show bgp ipv4 unicast
show bgp neighbors
show route-map
show prefix-list
```

Usa prefix filter, maximum-prefix, RPKI validation quando disponibile, session protection e change review. Un route leak può avere impatto globale.

## Ridondanza

HSRP/VRRP forniscono gateway virtuale. LACP aggrega link ma non sostituisce spanning tree o routing. ECMP distribuisce flussi tra path equivalenti.

Verifica failure reale: link down, device down, control plane down e upstream failure producono comportamenti diversi.

## DNSSEC

DNSSEC firma dati DNS e crea una chain of trust tramite DS e DNSKEY. Non cifra le query.

```bash
dig example.org DNSKEY +dnssec
dig example.org A +dnssec
dig example.org DS +trace
delv example.org
```

Controlla firma, scadenza, clock, delega, rollover e validazione del resolver. Un errore DNSSEC può apparire come `SERVFAIL`.

## Architettura enterprise

- access/distribution/core o fabric;
- segmentazione utenti, server, management e guest;
- routing al confine della policy;
- servizi DNS/DHCP/NTP ridondanti;
- management out-of-band;
- AAA centralizzato;
- logging, flow e packet capture point;
- configurazione versionata e backup;
- IPAM e source of truth.

## Scenario tecnico
Costruisci tre router virtuali, configura OSPF multi-area, inietta una route controllata, interrompi un link e misura convergenza. Aggiungi due AS BGP di laboratorio con prefix filter e maximum-prefix. Documenta control plane e forwarding.

## Collegamenti

- [[Fondamenti di rete]]
- [[IPv6 routing firewall VPN e diagnostica avanzata]]
- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Network security]]
