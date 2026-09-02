---
title: Sicurezza automotive, CAN, reti mobili e crittografia post-quantum
type: reference
area: specialized-security
status: evergreen
level: advanced
visibility: public
created: 2026-08-08
updated: 2026-08-08
source_kind: standards
tags: [automotive, can, mobile-networks, post-quantum, cryptography]
aliases: [Sicurezza dei sistemi connessi specializzati]
---

# Sicurezza automotive, CAN, reti mobili e crittografia post-quantum

## Automotive e CAN

CAN arbitra messaggi tramite identificatore e non fornisce nativamente autenticazione o confidenzialità. Gateway, segmentazione, secure diagnostics, firmware firmato e monitoraggio limitano l'abuso. Test attivi richiedono banco isolato, alimentazione controllata, ripristino e assenza di collegamento a un veicolo in movimento.

## Reti mobili

SIM/eSIM, radio access network, core, signaling e servizi operatore formano trust boundary distinti. Rogue base station, downgrade, esposizione del signaling, configurazione APN e supply chain richiedono contromisure diverse. Le analisi radio rispettano licenze, spettro e autorizzazioni locali.

## Post-quantum cryptography

La migrazione riguarda inventario crittografico, crypto-agility, formato di chiavi/certificati, prestazioni e interoperabilità. ML-KEM, ML-DSA e SLH-DSA sono standard NIST; implementazione, random number generation, side channel e gestione chiavi restano determinanti.

## Matrice di controllo

| Dominio | Asset | Evidenza | Controllo |
|---|---|---|---|
| automotive | ECU, gateway, firmware | bus log, versione, firma | segmentazione, secure boot, rate control |
| mobile | identità, signaling, traffico | log modem/core, capture autorizzata | autenticazione, cifratura, policy |
| PQC | chiavi, certificati, protocolli | inventario e test interoperabilità | crypto-agility e rollout ibrido |

## Fonti primarie

- NIST post-quantum cryptography: https://csrc.nist.gov/projects/post-quantum-cryptography
- ISO/SAE 21434 overview: https://www.iso.org/standard/70918.html
- 3GPP security specifications: https://www.3gpp.org/technologies/security
