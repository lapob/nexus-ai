---
title: Sistemi distribuiti, resilienza e consistenza
type: technical-guide
area: distributed-systems
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [distributed-systems, resilience, consistency]
aliases: []
---

# Sistemi distribuiti, resilienza e consistenza

## Assunzioni da evitare

La rete non è affidabile, la latenza non è zero, la banda non è infinita, la
topologia cambia e i clock non coincidono. Un timeout crea incertezza: il server
può avere completato l'operazione.

## Semantica

At-most-once evita duplicati ma può perdere; at-least-once ritenta ma richiede
consumer idempotente; exactly-once è una proprietà circoscritta ottenuta con
vincoli e coordinamento, non una magia end-to-end.

Idempotency key, inbox/outbox, deduplica e state machine rendono i retry
controllabili. Saga coordina transazioni locali e compensazioni; una
compensazione non è sempre un rollback perfetto.

## Consistenza

Linearizability fa apparire operazioni atomiche in tempo reale; serializability
riguarda equivalenza tra transazioni; eventual consistency converge se cessano
gli aggiornamenti. CAP riguarda comportamento durante una partizione, non una
scelta permanente di due lettere.

## Resilienza

Timeout < retry budget < deadline globale. Usare backoff con jitter, circuit
breaker, bulkhead, rate limit, load shedding e backpressure. Retry solo su errori
transitori e operazioni sicure/idempotenti.

## Verifica

Fault injection su latenza, perdita, duplicazione, crash e clock skew.
Controllare invarianti di business, non soltanto status HTTP. Runbook deve
indicare mitigazione, rollback e riconciliazione.
