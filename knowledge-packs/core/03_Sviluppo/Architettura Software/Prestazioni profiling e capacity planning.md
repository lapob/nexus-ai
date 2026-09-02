---
title: Prestazioni, profiling e capacity planning
type: operational-guide
area: performance-engineering
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [performance, profiling, capacity]
aliases: []
---

# Prestazioni, profiling e capacity planning

## Metodo

Definire workload e SLO prima di ottimizzare. Misurare distribuzioni e
percentili: la media nasconde tail latency. Throughput e latenza interagiscono;
quando l'utilizzazione si avvicina alla saturazione, le code crescono.

Little: `L = λW`, con elementi medi nel sistema, tasso di arrivo e tempo medio.
Amdahl limita lo speedup della porzione parallelizzata.

## Profiling

- CPU sampling per hotspot;
- tracing per percorso e attese;
- allocation profile per churn e leak;
- I/O profile per latenza e queue;
- database plan per scansioni, cardinalità e lock;
- flame graph per stack aggregati.

Ottimizzare algoritmo, accesso ai dati e chiamate remote prima delle
micro-ottimizzazioni. Benchmark richiede warm-up, ambiente stabile, dataset
rappresentativo e confronto statistico.

## Capacity

Stimare picco, crescita, headroom, failure scenario e costo. Load test misura
carico atteso; stress trova il limite; soak trova leak; spike verifica
elasticità. Registrare punto di saturazione e comportamento di degradazione.

## Checklist

- budget di latenza per dipendenza;
- limiti di concorrenza e backpressure;
- cache hit/miss e invalidazione;
- dimensione pool e code;
- profilo hardware adattivo;
- guardrail per ridurre qualità visiva prima della funzionalità.
