---
title: Code review sicura e test automatizzati
type: note
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-28
updated: 2026-08-08
source_kind: curated
tags: [appsec, code-review, sast, sca, security-testing]
aliases: [Secure code review]
---

# Code review sicura e test automatizzati

## Sequenza

1. identifica asset, trust boundary e dati sensibili;
2. segui gli input fino ai sink;
3. verifica autenticazione, autorizzazione e isolamento tenant;
4. controlla errori, logging e gestione dei segreti;
5. esamina dipendenze, build e configurazione;
6. conferma i finding con test riproducibili;
7. aggiungi un test di regressione.

## Punti di controllo

- validazione sintattica e semantica degli input;
- query parametrizzate e output encoding contestuale;
- allowlist per percorsi, URL, comandi e formati;
- autorizzazione server-side su ogni oggetto;
- limiti di dimensione, frequenza, tempo e concorrenza;
- parsing sicuro di file, archivi e dati serializzati;
- crittografia con primitive e librerie mantenute;
- segreti fuori da codice, log, errori e artefatti;
- dipendenze bloccate, verificate e aggiornabili;
- default sicuri e fallimento chiuso.

## Pipeline minima

| Controllo | Scopo | Limite |
| --- | --- | --- |
| lint e typecheck | errori precoci | non trova vulnerabilità logiche |
| unit/integration test | comportamento e regressioni | dipende dalla copertura |
| SAST | pattern e data flow | richiede triage |
| SCA | dipendenze note | non prova l'esploitabilità |
| secret scanning | credenziali accidentali | gestire falsi positivi |
| DAST | comportamento esposto | solo ambiente autorizzato |
| fuzzing | parser e stati inattesi | richiede harness e tempo |

## Finding

Ogni finding deve contenere precondizioni, percorso interessato, impatto,
evidenza minima, probabilità, remediation e test di conferma. Evita severity
basate soltanto sul nome della debolezza.

## Collegamenti

- [[Secure SDLC e OWASP 2025]]
- [[02_Cybersecurity/Fondamenti/Threat Modeling]]
- [[03_Sviluppo/Sicurezza del software]]
- [[02_Cybersecurity/Ethical Hacking/Regole di ingaggio e reporting|Struttura dei finding]]
