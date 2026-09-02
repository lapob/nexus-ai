---
title: APIs
type: index
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-07-23
source_kind: curated
tags: [nexus, development]
aliases: []
---

# APIs

Un'API è un contratto tra sistemi. Deve rendere espliciti identità, schema, errori, limiti, compatibilità e osservabilità.

## Checklist

- risorse, metodi e status coerenti;
- schema e validazione sia in ingresso sia in uscita;
- autenticazione e autorizzazione per oggetto/azione;
- idempotenza, pagination, rate limit e timeout;
- versioning e compatibilità;
- correlation ID, log e metriche;
- documentazione ed esempi eseguibili;
- test di contratto, integrazione e sicurezza.

**Gate:** API con specifica, test, error model, authz server-side e client resiliente.

- [[Progettazione API contratti affidabilita e sicurezza]]
- [[GraphQL gRPC WebSocket e protocolli applicativi]]
- [[01_Informatica/Networking/Fondamenti di rete|HTTP e TLS]]
- [[03_Sviluppo/JavaScript/Indice - JavaScript|JavaScript]]
- [[03_Sviluppo/Python Projects/Indice - Python Projects|Python]]
- [[02_Cybersecurity/Web Security/Indice - Web Security|Web/API Security]]
