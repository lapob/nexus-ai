---
title: Assembly e WebAssembly
type: overview
area: development
status: verified
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, assembly, wasm, reverse-engineering]
aliases: []
verified_at: 2026-08-08
review_after: 2027-02-08
---

# Assembly e WebAssembly

## Sintesi

Per assembly studia registri, stack, calling convention, memoria, flag, istruzioni, syscall e formato degli eseguibili su una singola architettura (x86-64 o ARM64). Usa debugger/disassembler esclusivamente su binari propri o autorizzati.

WebAssembly è un formato portabile a sandbox: moduli, memoria lineare, import/export e interazione con l'host. Collega questa nota a [[02_Cybersecurity/Reverse Engineering/Indice - Reverse Engineering|Reverse Engineering]].

## Confini e failure mode

L'assembly dipende da ISA, ABI, formato eseguibile e sistema operativo. WebAssembly definisce una macchina astratta, ma la sicurezza effettiva dipende dall'host, dalle capability importate e dall'interfaccia WASI. Overflow nella memoria lineare, import eccessivi e validazione incompleta restano rischi applicativi.

## Fonti primarie

- WebAssembly specifications: https://webassembly.org/specs/
- WebAssembly core specification: https://webassembly.github.io/spec/core/
- System V AMD64 ABI: https://gitlab.com/x86-psABIs/x86-64-ABI
