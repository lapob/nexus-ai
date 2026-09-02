---
title: MLOps: versionamento, deployment e monitoraggio
type: professional-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [mlops, deployment, monitoring]
aliases: []
---

# MLOps: versionamento, deployment e monitoraggio

## Sintesi

Versionare insieme codice, config, dataset manifest, feature, tokenizer, base
model, adapter, prompt, evaluation e runtime. Un nome senza digest non identifica
un artefatto riproducibile.

## Registro modello

ID prodotto, versione semantica, hash, base e licenza, dataset card, model card,
metriche, hardware, quantizzazione, approvatore e stato: experimental,
candidate, production, retired.

## Deployment

Offline packaging o download firmato; verifica hash; compatibilità hardware;
canary; shadow quando possibile; fallback al modello precedente. Separare
download, attivazione e migrazione. Non cambiare modello durante una richiesta.

## Monitoraggio

Disponibilità, TTFT, token/s, memoria, errori, stop, fallback, retrieval hit,
tool rejection e feedback esplicito. Per privacy, loggare metadati minimi e non
prompt completi per default.

## Miglioramento

Feedback approvato entra in coda di revisione, non direttamente nel training.
Deduplica, anonimizzazione, labeling e split contamination check precedono ogni
esperimento. Confrontare candidate e baseline sullo stesso harness.
