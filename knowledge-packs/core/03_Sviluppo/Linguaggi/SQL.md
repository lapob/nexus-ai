---
title: SQL
type: language
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, database, sql]
aliases: []
language: sql
---

# SQL

## Sintesi

SQL descrive relazioni e trasformazioni su insiemi. Il database protegge invarianti e transazioni: non deve essere trattato come semplice archivio di oggetti.

## Fondamenti

Modello relazionale, chiavi, vincoli, normalizzazione e denormalizzazione motivata; `SELECT`, join, aggregazioni, CTE, subquery e window function; transazioni ACID, livelli di isolamento, lock e deadlock; indici, statistiche e query plan; backup, restore e migrazioni.

## Metodo per una query

1. Definisci cardinalità e risultato atteso.
2. Scrivi dati di esempio e casi NULL/duplicati.
3. Usa join e filtri corretti.
4. Verifica il piano con dati rappresentativi.
5. Misura latenza, righe lette e memoria.
6. Aggiungi indice solo con una ragione verificata.

Un indice accelera alcune letture ma costa spazio e scritture. L'ordine delle colonne e la selettività contano.

## Sicurezza e affidabilità

- query parametrizzate, mai concatenazione;
- account applicativi least privilege e separati dalle migrazioni;
- vincoli di integrità nel database;
- transazioni brevi e retry solo per operazioni idempotenti;
- dati sensibili classificati, minimizzati e auditati;
- migrazioni compatibili con deploy progressivi e rollback;
- backup cifrati e ripristino provato.

## Progetto di padronanza

Modella ticket, aziende, tecnici e interventi. Applica chiavi/vincoli, crea query operative e report con window function, simula concorrenza, analizza piani e prepara una migrazione senza downtime.

PostgreSQL è un'ottima base generale; SQLite per locale/embedded; MySQL/MariaDB sono diffusi. Scegli document/key-value solo quando access pattern e consistenza lo giustificano.

## Fonte ufficiale

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[Sicurezza del software]]
