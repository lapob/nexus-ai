---
title: DNS, DHCP, PKI e troubleshooting dei servizi di rete
type: technical-guide
area: networking
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [dns, dhcp, pki, tls, troubleshooting]
aliases: [Troubleshooting DNS e PKI]
---

# DNS, DHCP, PKI e troubleshooting dei servizi di rete

## Sintesi

Segui il percorso link → indirizzo → route → nome → trasporto → TLS → applicazione. Non attribuire a DNS un problema di routing o a TLS un errore applicativo.

## DNS

```powershell
Resolve-DnsName example.org
Resolve-DnsName example.org -Type MX
Get-DnsClientServerAddress
ipconfig /displaydns
ipconfig /flushdns
```

```bash
dig example.org A
dig +trace example.org
resolvectl status
getent hosts example.org
```

Confronta risposta autorevole e ricorsiva, record, TTL, `CNAME`, split DNS e suffisso di ricerca. `NXDOMAIN` indica nome inesistente; timeout assenza di risposta; `SERVFAIL` richiede controllo di resolver, delega e DNSSEC.

## DHCP

```powershell
ipconfig /all
ipconfig /release
ipconfig /renew
Get-NetIPConfiguration
```

Verifica lease, gateway, DNS, subnet e conflitti. Prima del rinnovo su un sistema remoto valuta il rischio di perdere la sessione.

## TLS e PKI

```bash
openssl s_client -connect example.org:443 -servername example.org -showcerts
openssl x509 -in certificate.pem -noout -subject -issuer -dates -ext subjectAltName
```

Controlla SAN, validità, catena, CA trusted, uso della chiave, revoca e orologio. Non disabilitare la verifica TLS come correzione permanente.

## Collegamenti

- [[Fondamenti di rete]]
- [[Diagnostica e analisi di rete]]
- [[05_Risorse/Riferimenti operativi/DNS DHCP routing VPN e servizi di rete|Comandi dei servizi di rete]]
