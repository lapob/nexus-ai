---
title: PHP e Ruby
type: language
area: development
status: verified
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, web, php, ruby]
aliases: []
verified_at: 2026-08-08
review_after: 2027-02-08
---

# PHP e Ruby

## PHP

Tipi moderni, Composer, namespace, eccezioni, PDO parametrizzato, Laravel/Symfony, ciclo HTTP e configurazione del runtime.

## Ruby

Object model, block, enumerable, gem/Bundler, Rails, Active Record, test e background job.

Entrambi sono rilevanti per applicazioni web e audit di sistemi esistenti. Aggiornamenti, rischio delle dipendenze, escaping dei template, mass assignment e configurazione di produzione costituiscono confini critici.

## Failure mode

- confronto debole e coercizione inattesa dei tipi;
- query costruite per concatenazione anziché parametrizzate;
- deserializzazione di dati non fidati;
- secret nei file di configurazione o nei log;
- dipendenze non bloccate e runtime fuori supporto.

## Fonti primarie

- PHP Manual: https://www.php.net/manual/en/
- Ruby documentation: https://docs.ruby-lang.org/
- Bundler documentation: https://bundler.io/docs.html
