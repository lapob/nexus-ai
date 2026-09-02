---
title: Fondamenti di AI applicata
type: concept
area: tech
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [ai, llm, rag, agents]
aliases: [Fondamenti AI]
---

# Fondamenti di AI applicata

## Componenti

- **modello:** trasforma contesto in output probabilistico;
- **prompt/context:** istruzioni, dati e cronologia visibili al modello;
- **retrieval:** seleziona fonti esterne pertinenti;
- **tool:** capability deterministica eseguita dal sistema;
- **agent loop:** osserva, decide, agisce e verifica entro limiti;
- **eval:** misura qualità, sicurezza, costo e latenza su casi ripetibili.

Un LLM non “sa” se un comando è riuscito: serve osservare risultato, exit code e stato. Il tool non eredita automaticamente il consenso per azioni successive.

## Rischi principali

- allucinazione e falsa sicurezza;
- prompt injection da documenti o pagine;
- leakage di segreti nel contesto o nei log;
- eccesso di privilegi e azioni concatenate;
- retrieval di note obsolete o non verificate;
- assenza di test e tracciabilità.

## Uso corretto

1. definisci compito e criteri di successo;
2. limita dati e capability;
3. richiedi conferma per effetti esterni o distruttivi;
4. esegui con timeout e output catturato;
5. verifica stato reale;
6. registra decisione, consenso ed esito.

## Collegamenti

- [[Prompting e valutazione]]
