---
title: Diagnostica e analisi di rete
type: runbook
area: tech
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [networking, troubleshooting, packet-analysis]
aliases: [Troubleshooting rete]
---

# Diagnostica e analisi di rete

## Flusso dal basso verso l'alto

1. interfaccia attiva, indirizzo e route;
2. raggiungibilità del gateway;
3. risoluzione DNS;
4. connessione TCP/UDP e processo in ascolto;
5. TLS;
6. protocollo applicativo;
7. log client, server e apparati intermedi.

```bash
ip addr
ip route
ping -c 4 indirizzo
traceroute indirizzo
dig nome.example
ss -lntup
curl -v https://nome.example/
```

Su Windows usa `ipconfig /all`, `route print`, `tracert`, `Resolve-DnsName` e `Get-NetTCPConnection`.

## Packet analysis

Prima di catturare definisci domanda, interfaccia, intervallo e filtro. Una cattura può contenere credenziali, token e dati personali: usa traffico di lab, limita la durata e proteggi l'evidenza.

Filtri display Wireshark:

```text
dns
tcp.stream eq 0
ip.addr == 192.0.2.10
tcp.flags.syn == 1 && tcp.flags.ack == 0
http.request
```

## Interpretazione

- timeout non equivale a “host spento”;
- ICMP può essere filtrato mentre TCP funziona;
- traceroute mostra percorsi possibili, non una mappa assoluta;
- una porta aperta indica un listener, non identifica da sola prodotto o vulnerabilità;
- correla sempre pacchetti, processi e log.

## Lab

- [[02_Cybersecurity/Labs/Lab 002 - Networking|Lab 002]]
- [[02_Cybersecurity/Labs/Lab 004 - Wireshark|Lab 004]]
