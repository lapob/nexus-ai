---
title: Architettura dei calcolatori e rappresentazione dei dati
type: technical-guide
area: computer-science
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [cpu, memory, architecture, binary]
aliases: []
---

# Architettura dei calcolatori e rappresentazione dei dati

## Dati

Un bit rappresenta due stati. Interi unsigned usano base 2; signed usa
normalmente complemento a due. Con `n` bit: unsigned `0..2^n-1`, signed
`-2^(n-1)..2^(n-1)-1`. Floating point IEEE 754 separa segno, esponente e
mantissa: molti decimali non sono rappresentabili esattamente, quindi i
confronti numerici richiedono tolleranze e analisi dell'errore.

Endianness indica l'ordine dei byte. Encoding trasforma simboli in byte: UTF-8
è variabile, ASCII ne è un sottoinsieme. Serializzare richiede schema, versione,
limiti e validazione.

## CPU

ISA è il contratto visibile al software; microarchitettura è
l'implementazione. Pipeline, branch prediction, out-of-order execution e SIMD
aumentano throughput. Clock più alto non implica prestazioni proporzionali.
Amdahl: `speedup = 1 / ((1-P) + P/S)`, quindi la parte seriale limita il
parallelismo.

## Gerarchia memoria

Registri → cache L1/L2/L3 → RAM → SSD/HDD → rete. Scendendo aumenta capacità ma
anche latenza. Cache line, località e false sharing spiegano molte regressioni.
NUMA rende il costo della RAM dipendente dal nodo CPU.

## I/O

Interrupt segnala eventi; DMA trasferisce dati senza occupare la CPU per ogni
byte. Memory-mapped I/O espone registri dei dispositivi nello spazio indirizzi.
Throughput, IOPS e latenza misurano aspetti distinti.

## Scenario tecnico
- rappresentare interi signed e float;
- confrontare accesso sequenziale e casuale a un array;
- misurare single-thread, multi-thread e SIMD;
- osservare cache miss e context switch con profiler appropriati.
