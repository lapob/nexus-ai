---
title: Python: linguaggio, runtime ed ecosistema
type: language
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, python]
aliases: []
language: python
---

# Python: linguaggio, runtime ed ecosistema

## Sintesi

Python è la scelta principale per automazione, tooling, API, data analysis, AI e prototipi di sicurezza. La semplicità sintattica non elimina la necessità di progettare tipi, errori, dipendenze e concorrenza.

## Modello mentale

- ogni valore è un oggetto; nomi e oggetti sono distinti;
- liste/dizionari sono mutabili, tuple/stringhe immutabili;
- iteratori producono valori progressivamente; i generatori evitano collezioni intere;
- eccezioni rappresentano fallimenti, i context manager gestiscono risorse;
- type hint aiutano strumenti e lettori ma non validano input a runtime.

## Percorso tecnico

1. sintassi, funzioni, scope, comprehension e unpacking;
2. list/dict/set, iteratori e generatori;
3. classi, `dataclass`, protocolli e type hint;
4. moduli, package, `venv`, `pip` e `pyproject.toml`;
5. file, JSON, HTTP, logging e configurazione;
6. test, mocking dei confini, profiling;
7. processi, thread e `asyncio`, scegliendo in base a CPU/I/O.

## Struttura di progetto

```text
project/
  pyproject.toml
  src/package/
  tests/
  README.md
```

Ambiente isolato, dipendenze bloccate, formatter/linter/type checker e test devono essere riproducibili.

## Sicurezza

Non usare `eval`/`exec`, `pickle` o loader YAML insicuri su dati non fidati. Non costruire comandi shell, SQL o path concatenando input. Imposta timeout e limiti su HTTP, parser e upload; evita segreti in eccezioni e log. Per strumenti cyber opera solo su asset autorizzati.

## Progetto di padronanza

Crea una CLI che acquisisce log JSON, valida uno schema, normalizza timestamp, produce statistiche e report, gestisce file grandi in streaming e include test per record corrotti. Aggiungi modalità API e packaging.

Sei operativo quando sai isolare un progetto, modellare dati, gestire errori e risorse, testare i confini e diagnosticare prestazioni.

## Fonte ufficiale

- [Python Tutorial](https://docs.python.org/3/tutorial/)

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[Testing e qualita del software]]
- [[Sicurezza del software]]
