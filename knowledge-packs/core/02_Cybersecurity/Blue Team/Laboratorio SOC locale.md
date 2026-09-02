---
title: Laboratorio SOC locale
type: project-guide
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [blue-team, soc, detection-engineering, lab]
aliases: [Laboratorio SOC]
---

# Laboratorio SOC locale

## Obiettivo

Costruire una pipeline piccola ma osservabile: endpoint e servizio di lab producono eventi, un collector li normalizza, query/detection generano alert e un runbook guida il triage.

## Componenti minimi

- un endpoint Windows o Linux;
- un'app o servizio con autenticazione;
- log di sistema, processo, rete e applicazione;
- collector/storage con retention definita;
- clock sincronizzato;
- dataset di attività normale e simulata.

## Ciclo detection

1. descrivi comportamento e ipotesi;
2. identifica fonti e campi necessari;
3. genera telemetria in lab;
4. scrivi query leggibile;
5. misura veri/falsi positivi;
6. aggiungi contesto e priorità;
7. crea runbook;
8. mappa a ATT&CK solo dopo aver validato il comportamento.

## Deliverable

- diagramma flussi;
- data dictionary;
- tre detection con test;
- dashboard essenziale;
- timeline di incidente simulato;
- retrospettiva su copertura e blind spot.

## Collegamenti

- [[Threat Hunting e Detection Engineering]]
- [[Incident Response]]
