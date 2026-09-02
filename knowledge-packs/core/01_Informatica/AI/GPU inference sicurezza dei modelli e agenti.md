---
title: GPU inference, sicurezza dei modelli e agenti
type: reference
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-08-08
updated: 2026-08-08
source_kind: curated
tags: [gpu, inference, llm-security, agents, evaluation]
aliases: [Sicurezza e prestazioni dell inference locale]
---

# GPU inference, sicurezza dei modelli e agenti

## Prestazioni dell'inference

| Fase | Vincolo prevalente | Misura |
|---|---|---|
| caricamento | storage, RAM/VRAM, decompressione | load duration |
| prefill | compute e bandwidth | prompt token/s |
| decode | bandwidth e KV cache | generated token/s |
| contesto lungo | KV cache e attenzione | VRAM, latenza/token |
| batching | capacità e scheduling | throughput e p95 |

Quantizzazione riduce memoria e spesso aumenta velocità, ma può degradare capacità in modo non uniforme. La selezione richiede eval sul dominio, non soltanto parametri o benchmark sintetici.

## Confini di sicurezza

- modello e tokenizer sono input della supply chain;
- prompt, documenti RAG e output degli strumenti sono dati non fidati;
- istruzioni recuperate non diventano automaticamente policy;
- il modello propone azioni, mentre runtime e utente autorizzano;
- secret, endpoint e filesystem restano fuori dal contesto del modello;
- memoria personale richiede provenienza, consenso, scadenza e cancellazione.

## Failure mode agentici

Prompt injection, confused deputy, tool argument injection, loop, escalation dei permessi, azione parziale e output tardivo dopo cancellazione. Le contromisure includono schema rigido, capability, budget, idempotenza, checkpoint, approvazione e audit.

## Valutazione

Dataset versionato con casi normali, ostili e ambigui; metriche separate per retrieval, factuality, tool selection, autorizzazione, latenza al primo token e completamento. Ogni cambio di modello, quantizzazione, prompt o contesto riesegue il gate.

## Collegamenti

- [[RAG embeddings memoria e knowledge graph]]
- [[Agenti tool use pianificazione e consenso]]
- [[Evaluation safety e red teaming per AI]]
