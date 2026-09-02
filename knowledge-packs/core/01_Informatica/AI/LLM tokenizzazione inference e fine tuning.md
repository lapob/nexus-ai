---
title: LLM: tokenizzazione, inference e fine-tuning
type: technical-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [llm, transformers, inference, fine-tuning]
aliases: []
---

# LLM: tokenizzazione, inference e fine-tuning

## Sintesi

Tokenizer converte testo in token; token non equivale a parola. Transformer usa
embedding, attention, feed-forward, residual e normalization. Context window
limita token visibili; KV cache accelera generazione ma consuma memoria.

## Inference

Temperature modifica casualità, top-p limita massa probabilistica, stop sequence
termina output. Quantizzazione riduce memoria e spesso qualità in misura
dipendente da metodo, architettura e hardware. Batch aumenta throughput ma può
peggiorare latenza. Misurare time-to-first-token, token/s, memoria, qualità e
consumo energetico.

## Adattamento

- prompting: nessuna modifica ai pesi;
- RAG: contesto recuperato da fonti;
- fine-tuning supervisionato: apprende comportamento da esempi;
- adapter/LoRA: aggiorna pochi parametri;
- preference optimization: usa confronti o feedback;
- distillazione: trasferisce comportamento in modello più piccolo.

Il fine-tuning non è il metodo ideale per fatti che cambiano spesso: usare RAG.
Dataset piccolo ma pulito e mirato è preferibile a grandi quantità rumorose.
Separare esempi di stile, conoscenza fattuale, tool use e sicurezza.

## Proprietà e licenze

Conservare ID del base model, licenza, commit/versione, quantizzazione, adapter,
dataset, codice, hyperparameter ed evaluation. Nome commerciale e proprietà
degli adapter non cancellano diritti e condizioni del modello base.
