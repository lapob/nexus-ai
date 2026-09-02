---
title: Sistemi operativi, concorrenza e memoria
type: technical-guide
area: computer-science
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [operating-systems, concurrency, memory]
aliases: []
---

# Sistemi operativi, concorrenza e memoria

## Processi e thread

Il processo delimita memoria e risorse; il thread condivide address space,
handle e heap. Context switch salva e ripristina stato. User mode limita
privilegi; system call entra nel kernel. Scheduler bilancia fairness, priorità,
latenza e throughput.

## Memoria virtuale

Le page table traducono virtuale in fisico; TLB memorizza traduzioni recenti.
Page fault può caricare una pagina o indicare accesso invalido. Copy-on-write
rinvia copie. Working set troppo grande causa paging e thrashing.

## Concorrenza

Una race dipende dall'interleaving. Mutex protegge esclusione; semaphore
conta disponibilità; condition variable attende uno stato; primitive atomiche
offrono operazioni indivisibili con memory ordering. Deadlock richiede
mutua esclusione, hold-and-wait, no preemption e attesa circolare.

Strategie:

- ownership chiara e stato immutabile;
- message passing quando possibile;
- ordine globale dei lock;
- sezione critica minima;
- timeout e cancellazione strutturata;
- test con stress, fault injection e race detector.

## I/O

Blocking dedica un thread all'attesa; non-blocking restituisce subito;
asynchronous segnala completamento. Event loop scala bene per I/O, ma lavoro
CPU-bound deve essere spostato. Backpressure impedisce che il produttore saturi
memoria e consumatore.

## Failure mode

Handle leak, zombie, starvation, priority inversion, deadlock, livelock,
use-after-free, stack overflow e OOM. Diagnosticare con dump, stack, wait chain,
handle count, allocation profile e timeline.
