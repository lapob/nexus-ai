---
title: Compilatori, interpreti e toolchain
type: technical-guide
area: computer-science
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [compiler, interpreter, linker, toolchain]
aliases: []
---

# Compilatori, interpreti e toolchain

## Sintesi

Pipeline tipica:

```text
sorgente → token → AST → analisi semantica → IR → ottimizzazione
→ codice oggetto/bytecode → linking → caricamento → esecuzione
```

Lexer riconosce token; parser verifica grammatica; type checker controlla
vincoli; IR rende indipendenti frontend e backend. Interpreter esegue una
rappresentazione; JIT compila a runtime; AOT compila prima della distribuzione.

Linker risolve simboli e relocation tra oggetti e librerie. Linking statico
incorpora codice; dinamico carica shared library. ABI specifica calling
convention, layout e simboli: compatibilità sorgente non garantisce
compatibilità binaria.

## Build riproducibile

- bloccare versioni e hash delle dipendenze;
- separare sorgente da artefatti;
- eliminare timestamp e percorsi non deterministici;
- generare SBOM e firme;
- usare build pulite in ambiente isolato;
- conservare compiler flags, provenance e test.

## Debug

Simboli collegano indirizzi al sorgente. Debug build preserva informazioni ma
può cambiare timing e layout. Sanitizer rilevano classi di errori; profiler
misura dove si consuma tempo. Disassembly e map file aiutano quando stack e
simboli non bastano.
