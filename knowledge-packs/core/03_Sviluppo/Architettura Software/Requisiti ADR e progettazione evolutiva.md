---
title: Requisiti, ADR e progettazione evolutiva
type: professional-guide
area: software-architecture
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [requirements, adr, architecture]
aliases: []
---

# Requisiti, ADR e progettazione evolutiva

## Requisiti

Separare funzionali, qualità, vincoli e assunzioni. Un requisito utile ha
stakeholder, priorità, motivazione, criterio misurabile e tracciabilità.
Quality attribute scenario: sorgente dello stimolo, stimolo, ambiente,
artefatto, risposta e misura.

## Confini

Definire dominio, ownership dei dati, API, failure mode e trust boundary.
Preferire modulo coeso prima di servizio distribuito. Microservizi aggiungono
rete, osservabilità, deployment, consistenza e on-call: servono solo quando il
beneficio organizzativo supera il costo.

## ADR

```text
Titolo e stato
Contesto e forze
Decisione
Alternative
Conseguenze positive e negative
Piano di migrazione e revisione
```

ADR registra il perché, non sostituisce diagrammi e API. Aggiornare con una
nuova decisione senza riscrivere la storia.

## Evoluzione

Strangler pattern sostituisce gradualmente; feature flag separa deploy e
release; branch by abstraction consente migrazione interna; compatibility
window protegge client vecchi. Ogni cambiamento dati richiede dual read/write,
backfill verificato e rollback compatibile.
