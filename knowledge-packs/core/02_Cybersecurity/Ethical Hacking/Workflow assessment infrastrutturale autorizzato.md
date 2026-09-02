---
title: Workflow assessment infrastrutturale autorizzato
type: runbook
area: ethical-hacking
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: professional-practice
tags: [pentest, assessment, authorization]
aliases: [Workflow penetration test infrastrutturale]
---

# Workflow assessment infrastrutturale autorizzato

## Sintesi

> Solo asset, finestre e tecniche inclusi nelle regole d'ingaggio.

## Preparazione

- scope con IP, domini, cloud account ed esclusioni;
- contatti, finestra, stop condition e gestione incidenti;
- limiti di velocità e tecniche vietate;
- trattamento dati, retention e cifratura;
- identificatore univoco per evidenze e attività.

## Discovery non distruttiva

```bash
nmap -sn 192.0.2.0/28 --reason
nmap -sT -sV --version-light -T3 --max-rate 100 -oA evidence/services 192.0.2.10
nmap --script safe -sV -oA evidence/safe-checks 192.0.2.10
```

Nessun UDP massivo, spoofing, evasione o brute force senza autorizzazione
specifica. Per ogni attività registrare timestamp, sorgente, target, comando,
versione, output grezzo e interpretazione. Uno scanner produce ipotesi, non
finding.

## Validazione e report

Confermare manualmente protocollo, TLS, autenticazione, configurazione e patch.
Ogni finding contiene asset, evidenza minima, condizione, impatto realistico,
prerequisiti, severità, remediation, compensating control e retest. Infine
rimuovere account/file temporanei e consegnare hash delle evidenze.
