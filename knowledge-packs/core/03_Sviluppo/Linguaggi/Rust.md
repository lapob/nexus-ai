---
title: Rust
type: language
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, systems, rust]
aliases: []
language: rust
---

# Rust

## Sintesi

Rust consente software di sistema con sicurezza della memoria e concorrenza controllata dal type system, senza garbage collector. Il costo iniziale è imparare a modellare ownership e stati validi.

## Modello mentale

- ogni valore ha un owner; prestiti condivisi o mutabili rispettano regole precise;
- lifetime descrivono relazioni tra riferimenti, non “allungano” la vita dei dati;
- `Option` rende esplicita l'assenza, `Result` il fallimento;
- enum e pattern matching modellano stati;
- trait definiscono comportamento condiviso;
- `Send` e `Sync` governano molti confini concorrenti.

## Percorso

Ownership/borrowing → struct/enum → pattern matching → moduli/crate → generics/trait → iteratori/closure → errori → smart pointer → thread/concorrenza → async solo quando il problema lo richiede.

Usa Cargo per build, test, benchmark e documentazione. Formatter, Clippy e test fanno parte del gate.

## `unsafe`

`unsafe` non disattiva il borrow checker ovunque: abilita operazioni specifiche. Mantieni il blocco minimo, documenta invarianti, crea una API sicura attorno e verifica con test, fuzzing e strumenti appropriati.

## Progetto di padronanza

Costruisci un parser di log streaming con errori tipizzati, limiti di memoria e fuzz test; poi una CLI concorrente con cancellazione. Confronta le decisioni con [[C e C++]].

## Fonte ufficiale

- [The Rust Programming Language](https://doc.rust-lang.org/book/)

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[Sicurezza del software]]
