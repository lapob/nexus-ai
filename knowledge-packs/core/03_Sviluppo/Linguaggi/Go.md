---
title: Go
type: language
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, go, backend]
aliases: []
language: go
---

# Go

## Sintesi

Go privilegia toolchain uniforme, composizione e servizi concorrenti comprensibili. È adatto a CLI, rete, cloud, agent e backend.

## Da padroneggiare

- package, visibilità, moduli e standard library;
- array, slice, map, struct, pointer e metodi;
- interfacce implicite piccole, definite dal consumatore;
- errori espliciti, wrapping e `errors.Is/As`;
- goroutine, channel, mutex, `select` e race detector;
- `context` per cancellazione, deadline e dati di richiesta strettamente necessari;
- `defer`, chiusura risorse, HTTP server/client e test.

## Regole operative

Propaga `context`; imposta timeout anche sul client HTTP; limita goroutine e code; definisci ownership dei channel; non copiare struct con mutex; chiudi body e risorse; restituisci errori con contesto senza duplicare log a ogni livello.

La concorrenza richiede lifecycle: chi avvia una goroutine deve sapere come termina. Usa il race detector nei test, ma ricorda che trova solo corse eseguite.

## Sicurezza

Valida dimensioni e schemi, limita letture con size cap, usa `exec.Command` con argomenti separati, query parametrizzate, TLS verificato e privilegi minimi. Proteggi endpoint diagnostici e non esporre stack o configurazione.

## Progetto di padronanza

Crea un servizio di raccolta eventi con worker pool limitato, cancellazione, graceful shutdown, metriche, retry con backoff e storage intercambiabile. Testa race, timeout, duplicati e saturazione.

## Fonte ufficiale

- [Go Documentation](https://go.dev/doc/)

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[Testing e qualita del software]]
