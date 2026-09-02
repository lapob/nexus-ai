---
title: Test avanzati API, OAuth, GraphQL e business logic
type: security-guide
area: web-security
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [api-security, oauth, graphql, business-logic, authorized]
aliases: [API security testing]
---

# Test avanzati API, OAuth, GraphQL e business logic

## Sintesi

> Esegui soltanto su applicazioni e account compresi nello scope. Usa dati sintetici, rate limit concordati e prova d’impatto minima.

## Matrice autorizzativa

Prepara soggetti con ruoli differenti, oggetti posseduti/non posseduti e azioni read/create/update/delete/approve/export. Verifica ogni combinazione lato server. Cambiare un ID e ricevere un dato altrui è un problema di autorizzazione per oggetto, non di “ID prevedibile”.

## OAuth/OIDC

Controlla redirect URI esatta, PKCE, `state`, `nonce`, issuer, audience, scope, expiry, revoca e separazione tra client. Verifica che access token destinati a un servizio non siano accettati da un altro e che l’ID token non venga usato come bearer token.

## GraphQL

Mappa schema autorizzato, field authz, depth/complexity, alias batching, pagination e subscription. Errori e introspection non devono esporre segreti; disabilitare introspection non corregge resolver non autorizzati.

## Business logic

Modella invarianti: prezzo non negativo, approvazione separata, uso singolo di coupon/token, limite di quantità, ordine valido degli stati. Testa concorrenza e replay con richieste controllate, senza generare carico destabilizzante.

## Upload e webhook

Valida tipo reale, dimensione, nome generato, storage separato e processing isolato. Per webhook verifica firma, timestamp, replay, idempotenza e autenticità della destinazione.

## Evidenza

Conserva richiesta e risposta minimizzate, due identità di test, risultato atteso/osservato e remediation server-side. Rimuovi token e dati personali.

## Collegamenti

- [[Metodologia di test web]]
- [[Autenticazione e sessioni]]
- [[03_Sviluppo/APIs/GraphQL gRPC WebSocket e protocolli applicativi|Protocolli API]]
