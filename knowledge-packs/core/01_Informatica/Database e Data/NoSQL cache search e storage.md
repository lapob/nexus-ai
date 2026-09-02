---
title: NoSQL, cache, search e storage
type: technical-guide
area: databases
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [nosql, cache, search, storage]
aliases: []
---

# NoSQL, cache, search e storage

## Scelta per access pattern

- key-value: lookup semplice e sessioni;
- documentale: aggregati con schema evolutivo;
- wide-column: scritture distribuite e query per partition key;
- graph: traversal di relazioni;
- time-series: eventi ordinati nel tempo;
- search engine: full-text e ranking;
- object storage: blob grandi e immutabili.

NoSQL non elimina schema: lo sposta in applicazione, validazione e access
pattern. Definire consistenza, partizionamento, secondary index, retention,
backup ed export prima della scelta.

## Cache

Cache-aside carica su miss; write-through aggiorna cache durante la scrittura;
write-behind rinvia persistenza. Problemi: stale data, stampede, hot key,
eviction e invalidazione. Usare TTL con jitter, single-flight, limiti e
fallback. Non mettere segreti o dati senza adeguata separazione.

## Search

Inverted index mappa termini a documenti. Tokenizzazione, stemming, analyzer e
lingua cambiano risultati. Precision e recall vanno valutate su query reali.
Search index è una proiezione ricostruibile, non necessariamente la source of
truth.
