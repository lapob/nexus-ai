---
title: Catalogo degli scenari tecnici
type: index
area: home
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [scenarios, laboratories, validation, evidence]
aliases: [Scenari tecnici verificabili]
---

# Catalogo degli scenari tecnici

Indice degli ambienti riproducibili usati per verificare procedure, strumenti
e assunzioni. Ogni scenario è isolato, reversibile e basato su dati sintetici.

## Matrice dei domini

| Dominio | Oggetto della verifica | Evidenza attesa |
|---|---|---|
| sistemi | processi, memoria, servizi, storage, backup | metriche, log, confronto prima/dopo |
| networking | DNS, TCP, TLS, routing, MTU, VPN | packet capture e timeline |
| programmazione | correttezza, concorrenza, errori, performance | test, profiler e output deterministico |
| web e API | accessibilità, contratti, autenticazione, resilienza | test automatici e trace |
| dati | schema, transazioni, indici, migrazioni, restore | query plan, conteggi e hash |
| cloud e SRE | SLI/SLO, timeout, retry, idempotenza | dashboard e postmortem tecnico |
| blue team | logging, detection, triage e timeline | regole con match e non-match |
| offensive security | discovery e validazione controllata | scope, evidenza minima e remediation |
| AI locale | retrieval, factuality, latenza e tool use | dataset, metriche e audit |

## Ambienti ammessi

- macchine virtuali e reti host-only;
- container effimeri e snapshot ripristinabili;
- CTF e piattaforme che autorizzano espressamente il test;
- applicazioni deliberatamente vulnerabili;
- asset propri o coperti da regole di ingaggio scritte.

## Struttura dell'evidenza

| Campo | Contenuto |
|---|---|
| scope | asset, account, finestra temporale e limiti |
| baseline | stato noto prima della prova |
| procedura | comandi o codice effettivamente eseguiti |
| risultato | output minimizzato, timestamp e versione strumenti |
| failure mode | risultato negativo, ambiguità e falsi positivi |
| ripristino | rollback e verifica dello stato finale |
| difesa | indicatori, logging e mitigazione |

## Collegamenti

- [[02_Cybersecurity/Labs/Indice - Labs|Scenari cybersecurity]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze|Standard di laboratorio]]
- [[03_Sviluppo/Esempi di programmazione/Indice - Esempi di programmazione|Esempi di codice]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze|Standard di laboratorio]]
- [[02_Cybersecurity/Ethical Hacking/Regole di ingaggio e reporting|Struttura dei finding]]
