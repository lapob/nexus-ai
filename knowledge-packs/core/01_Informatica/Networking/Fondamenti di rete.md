---
title: Fondamenti di rete
type: concept
area: tech
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [networking, tcp-ip, dns, http]
aliases: [Fondamenti networking]
---

# Fondamenti di rete

## Dall'applicazione al collegamento

| Livello pratico | Responsabilità | Esempi |
|---|---|---|
| applicazione | significato dei messaggi | HTTP, DNS, SSH |
| trasporto | conversazione tra processi | TCP, UDP, porte |
| rete | instradamento tra reti | IPv4/IPv6, ICMP |
| collegamento | consegna nel segmento locale | Ethernet, Wi-Fi, ARP |

OSI è utile come linguaggio diagnostico; TCP/IP descrive meglio lo stack operativo.

## IP e subnetting

Una rete CIDR combina indirizzo e lunghezza del prefisso. In IPv4, `/24` lascia 8 bit agli host. Per ogni esercizio calcola rete, broadcast, intervallo host e gateway previsto; poi verifica con una calcolatrice soltanto alla fine.

## DNS

La risoluzione attraversa cache locali, resolver ricorsivo e server autoritativi. Record comuni: `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`. Un nome risolto non dimostra che il servizio applicativo funzioni.

```bash
dig example.com A
dig +trace example.com
nslookup example.com
```

## HTTP e TLS

Una richiesta contiene metodo, target, header e talvolta body. La risposta contiene status, header e body. HTTPS è HTTP sopra TLS: TLS autentica l'endpoint tramite certificati e protegge confidenzialità/integrità del canale, non rende sicura l'applicazione.

```bash
curl -v https://example.com/
openssl s_client -connect example.com:443 -servername example.com
```

## Collegamenti

- [[Diagnostica e analisi di rete]]
- [[03_Sviluppo/APIs/Indice - APIs|API]]
- [[02_Cybersecurity/Web Security/Indice - Web Security|Web Security]]
