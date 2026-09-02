---
title: GraphQL, gRPC, WebSocket e protocolli applicativi
type: development-guide
area: api
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [graphql, grpc, websocket, api, protocols]
aliases: [Protocolli API moderni]
---

# GraphQL, gRPC, WebSocket e protocolli applicativi

## GraphQL

Schema tipizzato e resolver non eliminano la necessità di autorizzazione. Applica authz per campo/oggetto, limiti di depth/complexity, pagination, timeout e DataLoader per evitare N+1.

```graphql
query Device($id: ID!) {
  device(id: $id) {
    id
    name
    status
  }
}
```

Disabilitare introspection non sostituisce i controlli. Evita errori che rivelano stack o schema interno.

## gRPC

Definisci contratti protobuf compatibili: non riutilizzare field number rimossi, preferisci cambi additivi e usa deadline/cancellation.

```proto
syntax = "proto3";
service DeviceService {
  rpc GetDevice(GetDeviceRequest) returns (Device);
}
message GetDeviceRequest { string id = 1; }
message Device { string id = 1; string name = 2; }
```

Usa TLS/mTLS dove richiesto, interceptor per identità e telemetria, limiti sui messaggi e retry solo per metodi idempotenti.

## WebSocket

Autentica l’upgrade, autorizza ogni messaggio, limita dimensione e frequenza, gestisci heartbeat, backpressure e reconnect. Valida `Origin` nelle applicazioni browser e non inserire token duraturi nella query string.

## Scelta

- REST/HTTP per interoperabilità e caching semplice;
- GraphQL per query client flessibili con governance;
- gRPC per contratti interni efficienti e streaming;
- WebSocket per canale bidirezionale persistente;
- event streaming per disaccoppiamento asincrono.

## Collegamenti

- [[Progettazione API contratti affidabilita e sicurezza]]
- [[03_Sviluppo/Architettura Software/Sistemi distribuiti resilienza e consistenza|Sistemi distribuiti]]
