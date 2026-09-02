---
title: PostgreSQL, Redis, Kafka e piattaforme dati operative
type: technical-guide
area: data-platform
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [postgresql, redis, kafka, database, operations]
aliases: [Data platform operations]
---

# PostgreSQL, Redis, Kafka e piattaforme dati operative

## PostgreSQL

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
SELECT pid, state, wait_event_type, wait_event, query
FROM pg_stat_activity;
SELECT relname, n_live_tup, n_dead_tup
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC;
```

Indici seguono query reali; troppi indici rallentano scrittura. Osserva cardinalità, selectivity, lock, vacuum, bloat, cache e I/O. Usa pool limitato: più connessioni non significa più throughput.

Backup logico e fisico hanno scopi diversi. Definisci RPO/RTO, conserva WAL quando serve e prova il restore.

## Redis

```bash
redis-cli INFO
redis-cli SLOWLOG GET 20
redis-cli --latency
redis-cli MEMORY STATS
```

Definisci eviction policy, TTL, persistence e comportamento quando Redis è indisponibile. Evita chiavi senza scadenza quando la crescita non è limitata. Non esporre Redis su reti non fidate.

## Kafka

Topic → partition → ordered log; consumer group distribuisce partition tra consumer. Definisci key, retention, replica, acknowledgment e schema evolution.

```bash
kafka-topics.sh --bootstrap-server broker:9092 --describe --topic events
kafka-consumer-groups.sh --bootstrap-server broker:9092 --describe --group app
```

Monitora consumer lag, under-replicated partition, disk, throughput ed errori. “Exactly once” dipende dall’intero flusso: spesso idempotenza e deduplica sono comunque necessarie.

## Data governance

Schema, owner, classificazione, retention, lineage, qualità e accessi. Cifra in transito e a riposo, separa ruoli, ruota credenziali e audita operazioni privilegiate.

## Collegamenti

- [[Database relazionali progettazione e tuning]]
- [[NoSQL cache search e storage]]
- [[Data engineering pipeline e qualita]]
