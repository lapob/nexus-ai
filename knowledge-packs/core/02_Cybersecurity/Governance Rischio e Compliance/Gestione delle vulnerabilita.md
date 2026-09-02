---
title: Gestione delle vulnerabilità
type: note
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-28
updated: 2026-08-08
source_kind: curated
tags: [vulnerability-management, risk, remediation, governance]
aliases: [Vulnerability management]
---

# Gestione delle vulnerabilità

## Ciclo operativo

1. inventario di asset, owner e criticità;
2. raccolta da scanner, advisory, test e segnalazioni;
3. deduplicazione e verifica dell'evidenza;
4. valutazione di esposizione, impatto e sfruttabilità;
5. assegnazione di owner e scadenza;
6. remediation o mitigazione documentata;
7. retest indipendente;
8. metriche, eccezioni e miglioramento del controllo.

## Priorità

CVSS è un input, non la decisione finale. Considera:

- asset esposto e raggiungibilità;
- privilegi e interazione necessari;
- presenza di exploit affidabili o sfruttamento osservato;
- dati e processi coinvolti;
- controlli compensativi;
- blast radius e dipendenze;
- costo e rischio della modifica;
- evidenza ottenuta nel contesto reale.

## Stati minimi

`nuova → validata → assegnata → in correzione → pronta per retest → chiusa`

Le eccezioni devono avere owner, motivazione, controllo compensativo, scadenza e
approvazione. “Rischio accettato” senza data di revisione non è uno stato finale.

## Metriche utili

- copertura inventario e scansione;
- tempo a triage e tempo a remediation;
- percentuale oltre SLA per criticità;
- tasso di riapertura al retest;
- vulnerabilità ricorrenti per causa;
- eccezioni scadute;
- asset senza owner.

## Collegamenti

- [[NIST CSF 2.0 operativo.md]]
- [[02_Cybersecurity/Blue Team/Incident Response]]
- [[02_Cybersecurity/Application Security/Code review sicura e test automatizzati]]
- [[02_Cybersecurity/Ethical Hacking/Regole di ingaggio e reporting|Struttura dei finding]]
