---
title: Runtime, memoria, concorrenza, tipi e debugging tra linguaggi
type: technical-guide
area: development
status: evergreen
level: advanced
visibility: public
created: 2026-07-30
updated: 2026-08-08
source_kind: curated
tags: [programming, runtimes, memory, concurrency, types, debugging]
aliases: [Internals dei linguaggi, Runtime e concorrenza]
---

# Runtime, memoria, concorrenza, tipi e debugging tra linguaggi

## Sintesi

La sintassi cambia; i problemi fondamentali restano dati, controllo, memoria, I/O, concorrenza ed errori.

## Modelli di esecuzione

- **C/C++:** compilazione nativa, controllo esplicito, comportamento indefinito possibile;
- **Rust:** nativo con ownership e borrow checking;
- **Java/Kotlin:** bytecode JVM, JIT e garbage collector;
- **C#/.NET:** IL, CLR, JIT/AOT e GC;
- **Go:** binario nativo, runtime, goroutine e GC;
- **Python:** interprete/VM, oggetti dinamici, GIL nell'implementazione CPython tradizionale;
- **JavaScript/TypeScript:** event loop e runtime browser/Node; TypeScript è cancellato a compile time.

Un benchmark deve includere warm-up, build mode, allocazioni, I/O e distribuzione dei tempi. Confrontare linguaggi con microbenchmark ingenui produce conclusioni false.

## Memoria

Distinguere stack, heap, storage statico, mapping e buffer nativi. Il GC elimina molte liberazioni manuali, non leak logici: cache senza limite, listener mai rimossi e riferimenti globali mantengono oggetti vivi.

Domande:

- chi possiede il dato?
- per quanto tempo vive?
- è copiato o condiviso?
- quale thread può modificarlo?
- esiste un limite?
- come viene rilasciata la risorsa esterna?

Usare RAII, `defer`, `using`, context manager o `try/finally` secondo il linguaggio.

## Concorrenza

Parallelismo esegue lavoro simultaneo; concorrenza coordina attività sovrapposte. Problemi classici:

- data race;
- race condition logica;
- deadlock e livelock;
- starvation;
- lost update;
- ordine di memoria;
- cancellazione ignorata;
- backpressure assente.

Preferire immutabilità, message passing, ownership chiara e sezioni critiche piccole. Ogni task asincrono deve avere proprietario, timeout, cancellazione e gestione dell'errore.

## Tipi e validazione

I tipi statici prevengono classi di errori ma non validano input esterni. Al confine:

1. decodificare;
2. limitare dimensione e profondità;
3. validare forma e semantica;
4. normalizzare una volta;
5. trasformare in un tipo interno valido;
6. rifiutare stati impossibili.

Evitare primitive obsession: rappresentare `UserId`, `Email`, `Money` e `ValidatedPath` con tipi e invarianti specifici.

## Errori

Classificare:

- errore atteso di dominio;
- input non valido;
- dipendenza temporaneamente indisponibile;
- violazione d'invariante;
- cancellazione;
- bug.

Non catturare tutto per continuare in uno stato sconosciuto. Aggiungere contesto senza duplicare segreti; preservare causa ed exit status.

## Debugging

Pipeline universale:

```text
riproduzione minima -> build con simboli -> breakpoint/log -> stato -> ipotesi -> test
```

Tool:

```bash
# C/C++
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug
gdb --args ./build/app

# Rust
cargo test
RUST_BACKTRACE=1 cargo run

# Go
go test -race ./...
go test -bench=. -benchmem ./...

# Python
python -X dev -m pytest
python -m cProfile -o profile.out app.py

# Node/TypeScript
node --inspect app.js
npx tsc --noEmit

# Java
jcmd PID Thread.print
jcmd PID GC.heap_info

# .NET
dotnet test
dotnet-counters monitor --process-id PID
```

Sanitizer, race detector e profiler rispondono a domande diverse; usarli su build e carichi appropriati.

## Progetto comparato

Implementare la stessa coda di job in Python, TypeScript, Go e Rust:

- limite di concorrenza;
- timeout per job;
- cancellazione;
- retry limitato;
- risultato tipizzato;
- metriche e test deterministici.

Confrontare semplicità, error handling, consumo, packaging e osservabilità, non solo righe di codice.

## Collegamenti

- [[Fondamenti di programmazione]]
- [[Toolchain native C C++ Rust Assembly e debugging]]
- [[Algoritmi e strutture dati]]
- [[Testing e qualita del software]]
- [[Sicurezza del software]]
- [[03_Sviluppo/Architettura Software/Prestazioni profiling e capacity planning|Prestazioni e profiling]]
