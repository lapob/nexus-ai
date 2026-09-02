---
title: Comandi Networking - Tech
type: reference
area: tech
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: curated
tags: [nexus, tech]
aliases: []
---

# Comandi Networking - Tech

## Sintesi

Raccolta dei comandi principali per diagnosi, configurazione e analisi di rete su Linux.

## Collegamenti Correlati

- [[01_Informatica/Networking/Diagnostica e analisi di rete]]
- [[01_Informatica/Networking/Fondamenti di rete]]
- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete]]
- [[05_Risorse/Riferimenti operativi/Comandi HTTP API e TLS|HTTP API e TLS]]

## Concetti Chiave

- La diagnostica di rete parte da IP locale, gateway, DNS e raggiungibilita.
- `ping`, `traceroute`, `ss`, `dig` e `curl` rispondono a domande diverse.
- Prima si verifica la connettivita, poi il DNS, poi le porte e infine il servizio applicativo.
- Le scansioni devono essere eseguite solo su sistemi propri o autorizzati.

## Identita e Interfacce

```bash
hostname
whoami
ip a
ip link
ip addr show
```

## Routing

```bash
ip route
ip route get 8.8.8.8
route -n
```

## Connettivita

```bash
ping -c 4 8.8.8.8
ping -c 4 example.com
ping -i 0.5 192.168.1.1
```

## Tracciamento Percorso

```bash
traceroute example.com
tracepath example.com
tracert example.com
```

## Porte e Connessioni

```bash
ss -tulpn
ss -tunap
netstat -tulpn
netstat -ano
```

## DNS

```bash
nslookup example.com
dig example.com
dig A example.com
dig MX example.com
host example.com
resolvectl status
resolvectl query example.com
```

## Test HTTP e API

```bash
curl -I https://example.com
curl -v https://example.com
curl -X GET https://api.example.com
wget https://example.com/file.zip
openssl s_client -connect example.com:443 -servername example.com
```

## Cattura e Osservazione

```bash
sudo tcpdump -D
sudo tcpdump -i interfaccia -nn
sudo tcpdump -i interfaccia -nn host 192.0.2.10
sudo tcpdump -i interfaccia -nn -w lab.pcapng
tshark -r lab.pcapng -q -z conv,tcp
```

Le catture possono contenere credenziali e dati personali. Limita interfaccia, filtro e durata.

## Scansione Base Autorizzata

```bash
nmap target
nmap -sV target
nmap -p 22,80,443 target
```

## Troubleshooting Linux Rapido

```bash
ip a
ip route
ping -c 4 8.8.8.8
ping -c 4 example.com
dig example.com
ss -tulpn
curl -I https://example.com
```

## Indicazioni operative

- Seguire sempre l'ordine: interfaccia, route, DNS, porta, servizio.
- Annotare errore, comando usato e risultato nella nota [[01_Informatica/Networking/Diagnostica e analisi di rete]].
