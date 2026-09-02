---
title: Internals di database, compilatori e tracing distribuito
type: reference
area: software-architecture
status: evergreen
level: advanced
visibility: public
created: 2026-08-08
updated: 2026-08-08
source_kind: curated
tags: [database-internals, compilers, llvm, distributed-tracing]
aliases: [Runtime e osservabilita delle piattaforme software]
---

# Internals di database, compilatori e tracing distribuito

## Database internals

Pagina, buffer pool, WAL, MVCC, lock/latch, indice e compaction determinano durabilità e latenza. Il piano di esecuzione collega cardinalità stimata, algoritmo di join, access path, memoria e I/O. Un indice accelera letture specifiche ma aumenta write amplification, storage e costo di manutenzione.

## Pipeline dei compilatori

`sorgente → lexer/parser → AST → analisi semantica → IR → ottimizzazione → code generation → linking`

LLVM separa front-end, rappresentazione intermedia e backend. Undefined behavior, ABI, link-time optimization e informazioni di debug influenzano sia performance sia possibilità di analisi.

## Distributed tracing

Trace, span, context propagation e baggage collegano richieste tra processi. Sampling head-based è prevedibile ma può perdere eventi rari; tail-based decide dopo aver osservato il trace ma richiede buffer e coordinamento. Cardinalità non limitata e dati personali negli attributi sono failure mode operativi e di privacy.

## Correlazione

Un rallentamento applicativo può derivare da stima errata del database, pausa runtime, contesa, rete o dipendenza. Trace e profilo indicano dove trascorre il tempo; log e metriche spiegano stato e frequenza. Nessun segnale singolo sostituisce gli altri.

## Fonti primarie

- PostgreSQL internals: https://www.postgresql.org/docs/current/internals.html
- LLVM documentation: https://llvm.org/docs/
- OpenTelemetry specifications: https://opentelemetry.io/docs/specs/
