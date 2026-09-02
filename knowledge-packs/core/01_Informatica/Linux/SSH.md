---
title: SSH
type: concept
area: tech
status: verified
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: curated
tags: [nexus, tech]
aliases: []
verified_at: 2026-08-08
review_after: 2027-02-08
---

# SSH

## Sintesi

Protocollo per accesso remoto, esecuzione di comandi, trasferimento file e tunneling autenticato. La sicurezza dipende dalla verifica della host key, dalla protezione delle chiavi utente e dalla configurazione del server.

## Concetti Chiave

- Chiavi pubbliche/private, autenticazione e host remoti.
- Collegamenti: [[01_Informatica/Linux/Fondamenti e amministrazione Linux]], [[01_Informatica/Networking/Indice - Networking|Networking]], [[Comandi Linux]]

## Comandi

```bash
ssh user@host
ssh-keygen
ssh-copy-id user@host
scp file.txt user@host:/path/
```

## Sicurezza

- verifica il fingerprint al primo collegamento tramite un canale separato;
- preferisci chiavi con passphrase e agent con durata limitata;
- disabilita login root e password sul server solo dopo aver provato un accesso alternativo;
- limita utenti, sorgenti e forwarding;
- proteggi `~/.ssh`, chiavi private e backup;
- controlla log e revoca le chiavi non più necessarie.

## Failure mode

- host key cambiata: possibile reinstallazione legittima o intercettazione;
- permessi troppo aperti su chiavi e configurazione: rifiuto del client o esposizione;
- agent forwarding indiscriminato: uso della credenziale attraverso host compromessi;
- algoritmi legacy: compatibilità ottenuta riducendo la sicurezza.

## Fonti primarie

- OpenSSH manual pages: https://man.openbsd.org/ssh
- Client configuration: https://man.openbsd.org/ssh_config
- Server configuration: https://man.openbsd.org/sshd_config
