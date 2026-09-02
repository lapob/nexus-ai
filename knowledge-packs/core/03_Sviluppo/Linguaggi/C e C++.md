---
title: C e C++
type: language
area: development
status: verified
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, systems, c, cpp]
aliases: []
language: c-cpp
verified_at: 2026-08-08
review_after: 2027-02-08
---

# C e C++

## C

Tipi e conversioni, puntatori, array e stringhe, struct/union, memoria dinamica, preprocessor, compilazione/linking, ABI, file e socket. Comprendi undefined behavior, buffer boundary, integer overflow e lifetime.

## C++

RAII, value semantics, reference, smart pointer, container e algoritmi STL, template, move semantics, exception safety, concurrency e build con CMake.

## Pratica sicura

Abilita warning e sanitizer, usa strumenti di analisi statica, preferisci astrazioni con bounds checking, fai fuzzing dei parser e tratta ogni input come non fidato.

## Versioni e toolchain

C23 corrisponde a ISO/IEC 9899:2024; C++23 a ISO/IEC 14882:2024. Le implementazioni possono supportare solo sottoinsiemi: versione del compilatore, standard selezionato e flag fanno parte dell'evidenza di build.

```bash
cc -std=c23 -Wall -Wextra -Wconversion -fsanitize=address,undefined source.c
c++ -std=c++23 -Wall -Wextra -Wconversion -fsanitize=address,undefined source.cpp
```

## Fonti primarie

- ISO C working group: https://www.open-std.org/jtc1/sc22/wg14/
- ISO C++ current standard: https://isocpp.org/std/the-standard
