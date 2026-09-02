---
title: Assessment wireless e IoT autorizzato
type: reference
area: cybersecurity
status: verified
level: intermediate
visibility: public
created: 2026-07-27
updated: 2026-08-08
source_kind: official
tags: [cybersecurity, wireless, mobile, iot, authorized-lab]
aliases: [Assessment wireless, Assessment IoT]
verified_at: 2026-08-08
review_after: 2027-02-08
rag: true
---

# Assessment wireless e IoT autorizzato

## Preparazione

- definire SSID, BSSID, bande, sedi, orari e dispositivi autorizzati;
- evitare interferenze e denial of service;
- concordare trattamento di capture, credenziali e dati personali;
- predisporre rollback e contatto di emergenza.

## Wi-Fi

- inventario AP e controller;
- modalità di autenticazione, cifratura e separazione guest/corporate;
- gestione certificati per 802.1X;
- protezione management frame quando supportata;
- rilevamento rogue AP ed evil twin;
- isolamento client, VLAN, ACL e accesso ai servizi interni;
- policy WPS e credenziali amministrative.

## IoT

- identità univoca e onboarding sicuro;
- aggiornamenti firmati e rollback;
- servizi esposti e protocolli legacy;
- segreti hardcoded o condivisi;
- cifratura in transito e a riposo;
- logging, inventario e fine supporto;
- segmentazione e principio del minimo privilegio.

## Mobile

- storage locale, backup e screenshot;
- deep link, WebView e certificate validation;
- autorizzazioni e dati nei log;
- gestione sessione e token;
- dipendenze e protezione della pipeline di rilascio.

## Fonti

- [NIST IoT Cybersecurity](https://www.nist.gov/itl/applied-cybersecurity/nist-cybersecurity-iot-program)
- [OWASP Mobile Application Security](https://mas.owasp.org/)
