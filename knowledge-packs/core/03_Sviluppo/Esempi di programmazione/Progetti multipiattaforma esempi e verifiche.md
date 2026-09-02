---
title: Progetti multipiattaforma esempi e verifiche
type: learning-path
area: programming
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [programming, projects, exercises, testing, portfolio]
aliases: [Percorso progetti di programmazione]
---

# Progetti multipiattaforma esempi e verifiche

## Sintesi

L’obiettivo non è copiare snippet, ma costruire lo stesso sistema in forme diverse comprendendo tipi, I/O, concorrenza, errori, test, packaging e sicurezza.

## Regole comuni

Ogni progetto include:

- README con scopo, installazione, esempi e limiti;
- configurazione esterna validata;
- error handling e exit code coerenti;
- log senza segreti;
- unit test e almeno un integration test;
- formatter, lint e analisi dipendenze;
- build riproducibile;
- threat model essenziale;
- evidenza di esecuzione nel portfolio.

## Progetto 1 — CLI diagnostica

Costruisci una CLI che mostra OS, CPU, memoria, spazio, rete e processi principali senza modificare il sistema.

### Implementazioni

- Python: `argparse`, `pathlib`, `subprocess` con lista argomenti;
- PowerShell: cmdlet CIM e output oggetti;
- Go: `flag`, `context`, encoding JSON;
- Rust: `clap`, `serde`, gestione errori tipizzata.

### Contratto

```json
{
  "schema_version": 1,
  "host": "lab-01",
  "checks": [
    {"name": "disk_free", "status": "ok", "value": 42, "unit": "percent"}
  ]
}
```

### Verifica

- funziona senza privilegi amministrativi;
- timeout per processi esterni;
- output JSON valido anche in errore;
- percorsi e nomi host non entrano nei log di test;
- test su valore mancante e comando non disponibile.

## Progetto 2 — API locale

Servizio CRUD per inventario di laboratorio con SQLite/PostgreSQL.

### Varianti

- TypeScript + framework minimale;
- Python con API asincrona;
- Java/Kotlin;
- C#/.NET;
- Go standard library o router leggero.

### Requisiti

Schema OpenAPI, pagination, validazione, authz per ruolo, idempotency key, migration, correlation ID e graceful shutdown.

### Test

```text
creazione valida
input non valido
oggetto inesistente
utente senza autorizzazione
richiesta duplicata
database temporaneamente indisponibile
cancellazione durante una richiesta lenta
```

## Progetto 3 — Client mobile

Flutter, Android Kotlin oppure SwiftUI consumano l’API locale.

### Stati UI

`idle → loading → data | empty | error | cancelled`

Il client supporta offline controllato, retry manuale, accessibilità, storage protetto per sessione e nessun segreto nel bundle.

### Verifica

- rotazione/ridimensionamento senza perdita di stato;
- rete lenta e offline;
- token scaduto;
- lista lunga;
- testo al 200%;
- screen reader;
- cancellazione della richiesta quando la schermata scompare.

## Progetto 4 — Pipeline eventi

Producer genera eventi di laboratorio, consumer valida schema e aggrega metriche. Implementa prima con una coda in memoria, poi Redis Streams o Kafka.

Studia ordering, retry, dead-letter, idempotenza, consumer lag e schema evolution.

## Progetto 5 — Tool nativo

Utility C++, Rust o Swift che legge un formato binario documentato.

Requisiti:

- limiti su dimensioni e offset;
- integer overflow controllato;
- fuzz test del parser;
- sanitizer;
- corpus valido e non valido;
- nessun accesso fuori dai buffer.

## Progetto 6 — Detection lab

Genera eventi benigni e costruisci una regola Sigma/KQL o una query SIEM. La repository contiene fixture, query, expected match e expected non-match.

Non usare malware reale quando eventi sintetici descrivono la stessa proprietà osservabile.

## Valutazione

| Dimensione | Domanda |
|---|---|
| correttezza | soddisfa contratto e casi limite? |
| mantenibilità | struttura e nomi spiegano l’intento? |
| testabilità | dipendenze e tempo sono controllabili? |
| sicurezza | input, segreti, authz e dipendenze? |
| osservabilità | errore diagnosticabile senza dati sensibili? |
| prestazioni | misurate con carico rappresentativo? |
| distribuzione | build, configurazione e rollback riproducibili? |

## Collegamenti

- [[Indice - Esempi di programmazione]]
- [[03_Sviluppo/Mobile/Indice - Mobile Development|Mobile Development]]
- [[03_Sviluppo/APIs/Indice - APIs|API]]
