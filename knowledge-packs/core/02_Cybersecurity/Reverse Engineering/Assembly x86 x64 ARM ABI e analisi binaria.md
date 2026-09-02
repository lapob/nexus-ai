---
title: Assembly x86/x64, ARM, ABI e analisi binaria
type: security-guide
area: reverse-engineering
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [assembly, x86, x64, arm, abi, binary-analysis]
aliases: [Assembly per reverse engineering]
---

# Assembly x86/x64, ARM, ABI e analisi binaria

## Concetti

ISA definisce istruzioni e registri; ABI definisce chiamate, stack, registri preservati, layout e simboli. Endianness, alignment, calling convention e formato eseguibile sono necessari per interpretare il disassemblato.

## x86-64

Istruzioni comuni: `mov`, `lea`, `cmp`, `test`, salti condizionali, `call`, `ret`, operazioni bitwise e SIMD. `lea` può calcolare indirizzi o aritmetica senza accedere alla memoria.

Le convenzioni System V AMD64 e Windows x64 passano argomenti in registri differenti e hanno regole diverse per stack e shadow space.

## ARM64

Registri `x0-x30`, stack pointer, link register e condition flag. `bl` chiama, `ret` ritorna; load/store separano accesso memoria da aritmetica. Comprendi addressing mode e prologo/epilogo.

## Workflow

1. hash, formato, architettura e firma;
2. header, sezioni, import/export e stringhe;
3. entry point e funzioni principali;
4. rename di simboli e tipi basato su evidenze;
5. cross-reference e data flow;
6. debugger in laboratorio quando l’analisi statica non basta;
7. notebook con indirizzo, osservazione, ipotesi e confidenza.

## Strumenti

```bash
file binary
readelf -h -S -s binary
objdump -d -M intel binary
nm -C binary
strings -a -n 6 binary
```

Ghidra, Binary Ninja, IDA, radare2 e debugger automatizzano parti del lavoro ma possono sbagliare tipi, confini di funzione e control flow.

## Sicurezza

Campioni non trusted restano in un ambiente isolato. Non usare patching per rimuovere controlli su software non autorizzato. L’obiettivo è interoperabilità, ricerca, debugging o difesa concordata.

## Collegamenti

- [[Workflow sicuro di reverse engineering]]
- [[03_Sviluppo/Linguaggi/Toolchain native C C++ Rust Assembly e debugging|Toolchain native]]
