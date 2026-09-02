---
title: Progettazione API: contratti, affidabilità e sicurezza
type: development-guide
area: api
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [api, http, reliability, security]
aliases: [API design]
---

# Progettazione API: contratti, affidabilità e sicurezza

## Sintesi

Definisci risorse, operazioni, schema, errori, autenticazione, limiti e compatibilità prima dell’implementazione. Il contratto deve essere validabile e accompagnato da esempi.

## Errori e affidabilità

Restituisci identificatore stabile, messaggio comprensibile, dettagli validabili e correlation ID; mai stack trace, query, percorsi o segreti.

- timeout espliciti;
- retry solo per errori transitori, con backoff e jitter;
- idempotency key per operazioni ripetibili;
- circuit breaker per dipendenze instabili;
- limiti su body, paginazione e concorrenza;
- metriche, log strutturati e tracing;
- health check distinti per processo vivo e servizio pronto.

## Sicurezza

Autentica e autorizza ogni operazione sensibile. Valida schema e semantica lato server, applica minimo privilegio, rate limit e audit. Previeni IDOR/BOLA usando il soggetto autenticato. Per webhook verifica firma, timestamp e replay.

Preferisci cambi additivi e contract test dei consumer.

## Collegamenti

- [[Indice - APIs]]
- [[03_Sviluppo/Testing e qualita del software|Testing e qualità]]
- [[02_Cybersecurity/Web Security/Metodologia di test web|Test web]]
