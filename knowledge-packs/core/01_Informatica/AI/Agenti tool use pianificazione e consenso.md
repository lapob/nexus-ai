---
title: Agenti, tool use, pianificazione e consenso
type: technical-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [agents, tools, safety, planning]
aliases: []
---

# Agenti, tool use, pianificazione e consenso

## Sintesi

Un agente combina modello, stato, planner, catalogo strumenti, policy,
esecutore, osservazioni e audit. Il modello propone; codice deterministico
valida ed esegue.

## Contratto strumento

Nome e scopo, schema input/output, effetti, prerequisiti, timeout, idempotenza,
permessi, dati accessibili, errori e rollback. Allowlist esplicita; argomenti
validati; percorsi canonicalizzati; ambiente dei processi minimizzato.

## Ciclo

```text
intento → piano limitato → proposta tool → policy → consenso
→ esecuzione isolata → osservazione ridotta → verifica → risposta/audit
```

Limitare passi, tempo, costo e output. Ticket monouso lega consenso all'azione
esatta. Il consenso deve descrivere effetto e target, non essere generico.
Operazioni distruttive o irreversibili richiedono conferma più forte.

## Failure mode

Prompt injection, confused deputy, escalation di privilegi, loop, tool spoofing,
output injection, azione duplicata, risultato obsoleto e segreti nei log.
Difese: trust boundary, schema strict, policy fuori dal modello, idempotency key,
cancellazione, audit e human-in-the-loop.

## UX

Voce sintetica comunica risultato breve; dettaglio resta leggibile. Mostrare
stato reale, non “thinking” inventato. Consentire stop immediato. Nessuna azione
deve essere nascosta dietro animazioni.
