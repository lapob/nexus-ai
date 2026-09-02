---
title: Backend Java, .NET, Go, Node e Python in produzione
type: development-guide
area: backend
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [java, dotnet, go, node, python, backend]
aliases: [Backend production engineering]
---

# Backend Java, .NET, Go, Node e Python in produzione

## Proprietà comuni

Contratto validato, configurazione esterna, dependency injection ragionata, timeout, cancellazione, pool limitati, transazioni, idempotenza, log strutturati, metriche, tracing, health check e graceful shutdown.

| Runtime | Punti forti | Rischi tipici |
|---|---|---|
| JVM | ecosistema, profiling, concurrency | heap/GC, pool e classpath |
| .NET | tooling, async, integrazione Microsoft | sync-over-async, lifetime DI |
| Go | binari semplici, concurrency, rete | goroutine leak, errori ignorati |
| Node.js | I/O e TypeScript | event loop bloccato, dipendenze |
| Python | produttività e data ecosystem | GIL CPU-bound, packaging |

## Comandi essenziali

```bash
./mvnw test
./gradlew test
dotnet restore && dotnet test
go test -race ./...
npm ci && npm test
python -m venv .venv
python -m pytest
```

## Shutdown e cancellazione

Il server smette di accettare richieste, attende quelle attive entro una deadline, interrompe job cancellabili, flush dei buffer e chiude connessioni. Propaga il cancellation token/context fino a database e rete.

## Concorrenza

Evita stato globale mutabile. Dimensiona pool da carico e dipendenze, applica backpressure e code limitate. Un retry senza budget moltiplica il traffico durante un incidente.

## Dati

Transazione corta, indice coerente con query, migrazione backward-compatible e rollout expand/contract. Non usare cache come fonte autorevole; definisci invalidazione e comportamento in caso di cache down.

## Sicurezza

Dipendenze bloccate e scansionate, immagini minimali, utente non root, segreti esterni, authz per oggetto, log sanificati e limiti sugli input. Mantieni ambienti di build e runtime separati.

## Collegamenti

- [[Sistemi distribuiti resilienza e consistenza]]
- [[03_Sviluppo/APIs/Progettazione API contratti affidabilita e sicurezza|API]]
- [[Prestazioni profiling e capacity planning]]
