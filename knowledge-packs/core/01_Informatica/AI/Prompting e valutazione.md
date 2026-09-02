---
title: Prompting e valutazione
type: reference
area: tech
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [ai, prompting, evaluation]
aliases: [Prompt engineering]
---

# Prompting e valutazione

## Prompt operativo

Un buon prompt esplicita:

- ruolo e obiettivo;
- contesto attendibile e non attendibile;
- vincoli e azioni vietate;
- formato dell'output;
- criteri di successo;
- comportamento quando mancano dati.

## Pattern

```text
Obiettivo:
Contesto verificato:
Input non fidato:
Vincoli:
Output richiesto:
Criteri di verifica:
Se manca informazione:
```

## Eval minima

Costruisci un dataset piccolo ma stabile con:

- casi normali;
- edge case;
- input ambiguo;
- prompt injection;
- dati mancanti;
- richiesta che deve essere rifiutata o confermata.

Misura correttezza, citazioni, aderenza al formato, chiamate tool, latenza e costo. Conserva input e criterio atteso, non soltanto l'output “migliore”.

## Regola

Migliorare il prompt senza un eval è ottimizzazione a vista. Per azioni di sistema, la verifica deve leggere lo stato reale dopo l'esecuzione.
