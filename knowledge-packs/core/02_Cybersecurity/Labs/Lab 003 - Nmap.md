---
title: Lab 003 - Nmap
type: lab
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: lab
tags: [nmap, network-security, lab]
aliases: []
verification_scope: authorized-laboratory
---

# Lab 003 - Nmap

## Scope

Due VM possedute su rete isolata. Inserisci gli IP esatti inclusi e una velocità conservativa. Nessun indirizzo esterno.

## Obiettivo

Confrontare ciò che Nmap riporta con lo stato reale del target e distinguere discovery, porte, servizi e vulnerabilità.

## Procedura

1. Sul target annota listener e versioni attese.
2. Esegui host discovery sulla sola subnet di lab.
3. Scansiona un elenco limitato di porte TCP.
4. Aggiungi service detection e confronta l'ipotesi con il processo reale.
5. Chiudi un servizio, ripeti e spiega la differenza.
6. Confronta stati `open`, `closed` e `filtered` introducendo una regola firewall di lab.

```bash
nmap -sn 192.0.2.0/29
nmap -sT -p 22,80,443 192.0.2.2
nmap -sV -p 22,80,443 192.0.2.2
```

## Evidenza

- comando completo, versione, timestamp e scope;
- tabella aspettativa/osservazione;
- falso positivo o limite trovato;
- differenza tra “servizio identificato” e “vulnerabilità dimostrata”.

## Cleanup

Rimuovi regole firewall temporanee, arresta servizi di prova e ripristina snapshot.

## Collegamenti

- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Assessment di rete]]
- [[05_Risorse/Riferimenti operativi/Comandi Nmap|Comandi Nmap]]
