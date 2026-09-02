---
title: Data engineering, pipeline e qualità
type: technical-guide
area: data-engineering
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [etl, pipelines, data-quality]
aliases: []
---

# Data engineering, pipeline e qualità

## Sintesi

Batch elabora insiemi finiti; streaming elabora eventi continui. ETL trasforma
prima del caricamento, ELT usa il motore destinazione. Una pipeline affidabile è
idempotente, osservabile, versionata e riproducibile.

## Contratti dati

Definire schema, semantica, owner, freshness, completezza, unicità, range e
compatibilità. Schema evolution distingue modifiche backward, forward e
breaking. Event time e processing time non coincidono; watermark gestisce
ritardi.

## Qualità

- completezza e null inattesi;
- validità di tipo e dominio;
- unicità e duplicati;
- consistenza tra sorgenti;
- accuratezza rispetto a riferimento;
- tempestività;
- lineage e provenienza.

Quarantena i record invalidi senza perderli. Non correggere silenziosamente dati
di business. Separare raw immutabile, cleaned e curated; applicare retention e
controlli di accesso.

## Operazioni

Monitorare lag, throughput, error rate, volume anomalo, schema drift e costo.
Backfill deve usare versione esplicita del codice e non duplicare effetti.
Reprocessing richiede checkpoint e deduplica.
