---
title: Threat Modeling
type: methodology
area: cybersecurity
status: verified
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: curated
tags: [cybersecurity, threat-modeling, stride]
aliases: [Modellazione delle minacce]
verified_at: 2026-08-08
review_after: 2027-02-08
---

# Threat Modeling

## Sintesi

Analisi strutturata di asset, flussi, trust boundary, capacità degli attori e controlli. Non esiste una metodologia OWASP unica: STRIDE, attack trees, misuse case e metodi orientati alla privacy sono selezionati in base al sistema.

## Obiettivo

Individuare decisioni di sicurezza prima che diventino incidenti. Il risultato non è un diagramma perfetto, ma un backlog prioritizzato e verificabile.

## Procedura

1. definisci scopo, stakeholder e impatto temuto;
2. inventaria dati, componenti, identità e dipendenze;
3. disegna flussi e trust boundary;
4. formula minacce per asset e transizione;
5. collega controlli preventivi, detective e correttivi;
6. assegna owner, priorità e test;
7. registra rischio accettato e assunzioni.

## Domande STRIDE

| Categoria | Domanda |
|---|---|
| Spoofing | un attore può fingersi un'altra identità? |
| Tampering | dati o codice possono essere alterati? |
| Repudiation | manca evidenza affidabile delle azioni? |
| Information disclosure | un dato attraversa o raggiunge soggetti errati? |
| Denial of service | una risorsa può essere esaurita o bloccata? |
| Elevation of privilege | un'identità può ottenere capacità superiori? |

## Registro minimo

| ID | Asset/flusso | Minaccia | Prerequisiti | Impatto | Controllo | Test | Rischio residuo |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## Errori comuni

- modellare solo l'attaccante esterno;
- ignorare dipendenze, aggiornamenti e operatori;
- confondere vulnerabilità nota con minaccia;
- accettare “cifrato” o “autenticato” senza test;
- non aggiornare il modello quando cambia l'architettura.

## Collegamenti

- [[Modello operativo della sicurezza]]
- [[03_Sviluppo/Sicurezza del software|Sicurezza del software]]

## Fonti primarie

- OWASP Threat Modeling Project: https://owasp.org/www-project-threat-modeling/
- OWASP Developer Guide: https://owasp.org/www-project-developer-guide/release/design/threat_modeling/
