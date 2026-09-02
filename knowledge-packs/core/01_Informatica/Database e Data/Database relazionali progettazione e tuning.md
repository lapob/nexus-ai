---
title: Database relazionali, progettazione e tuning
type: technical-guide
area: databases
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [sql, database, transactions]
aliases: []
---

# Database relazionali, progettazione e tuning

## Schema

Entità e relazioni diventano tabelle, chiavi e constraint. Normalizzare evita
update anomaly; denormalizzare solo dopo misure. PK stabile, FK indicizzate
quando richiesto dalle query, `NOT NULL` e `CHECK` fanno rispettare invarianti
vicino ai dati.

## Transazioni

ACID descrive proprietà; isolamento regola fenomeni concorrenti. Comprendere
dirty read, non-repeatable read, phantom, lost update e write skew. MVCC riduce
lettori bloccati ma conserva versioni e richiede manutenzione.

## Query

Il planner stima cardinalità e costo. Leggere `EXPLAIN`: tipo di scan, join,
righe stimate/reali, sort, spill e I/O. Indice composito segue filtri, join e
ordinamento; il prefisso conta. Over-indexing rallenta scritture.

## Produzione

- connection pool limitato;
- timeout per statement e lock;
- migrazioni backward-compatible;
- replica lag monitorato;
- backup cifrato e restore provato;
- RPO/RTO dichiarati;
- least privilege e query parametrizzate;
- dati sensibili classificati e con retention.
