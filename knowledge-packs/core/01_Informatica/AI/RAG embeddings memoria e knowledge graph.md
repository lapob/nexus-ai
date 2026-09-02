---
title: RAG, embeddings, memoria e knowledge graph
type: technical-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [rag, embeddings, memory, knowledge-graph]
aliases: []
---

# RAG, embeddings, memoria e knowledge graph

## Sintesi

RAG separa generazione e conoscenza recuperabile.

```text
documenti → parsing → chunk → metadati → embedding/indice
query → riscrittura → retrieval → reranking → contesto → risposta con fonti
```

## Indicizzazione

Chunk per unità semantica, preservando titolo e percorso. Overlap moderato.
Metadati: fonte, versione, data, licenza, privacy, lingua e ACL. Hash permette
aggiornamento incrementale e deduplica.

BM25/lessicale eccelle su identificatori; vector search su similarità
semantica; hybrid combina entrambi. Reranker migliora precisione sui candidati.
Valutare recall@k, precision@k, MRR, nDCG e qualità della risposta grounded.

## Memoria

- working memory: turno corrente;
- episodica: eventi e conversazioni approvate;
- semantica: fatti stabili;
- procedurale: preferenze e workflow;
- knowledge pubblica: materiale distribuito.

Ogni memoria ha consenso, retention, modifica, cancellazione e provenienza.
Una conversazione non diventa automaticamente verità o training data.

## Sicurezza

Trattare documenti recuperati come dati non fidati. Rimuovere istruzioni che
tentano di cambiare policy, applicare ACL prima del retrieval, non dopo.
Proteggere contro poisoning, esfiltrazione, path traversal e cross-user leakage.
