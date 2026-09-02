---
title: SRE, osservabilità, incidenti e continuità
type: operational-guide
area: sre
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [sre, observability, incident-response]
aliases: []
---

# SRE, osservabilità, incidenti e continuità

## Obiettivi

SLI è una misura, SLO il target, SLA un impegno. Preferire indicatori percepiti
dall'utente: disponibilità buona, latenza, correttezza, freshness. Error budget
guida il compromesso tra release e stabilità.

## Osservabilità

Metrics aggregano, logs spiegano eventi, traces seguono richieste, profiles
mostrano consumo. Correlation ID e contesto strutturato collegano segnali.
Evitare PII e segreti. Alert su sintomi e burn rate, non su ogni oscillazione.

## Incident response

Ruoli: incident commander, operations, communication, scribe. Prima mitigare,
poi diagnosticare. Timeline unica, decision log, update regolari e criteri di
escalation. Postmortem senza colpa: impatto, rilevamento, timeline, cause
sistemiche, fattori contribuenti e azioni con owner/scadenza.

## Continuità

Business impact analysis definisce servizi critici, dipendenze, RPO e RTO.
Backup senza restore test è un'ipotesi. Game day e disaster recovery exercise
verificano persone, accessi, runbook, dati e comunicazioni.
