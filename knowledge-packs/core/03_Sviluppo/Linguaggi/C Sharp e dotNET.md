---
title: C Sharp e .NET
type: language
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, csharp, dotnet]
aliases: []
language: csharp-dotnet
---

# C Sharp e .NET

## Sintesi

C# e .NET sono adatti a desktop Windows, servizi, API, cloud, tooling e applicazioni multipiattaforma. La piattaforma offre runtime, garbage collector, librerie, build e diagnostica integrate.

## Da padroneggiare

- value/reference types, nullable reference types e generics;
- record, classi, interfacce, pattern matching e LINQ;
- eccezioni, `IDisposable`/`using` e configurazione;
- `Task`, `async/await`, cancellation token e thread pool;
- dependency injection, logging strutturato e options;
- file, HTTP, serializzazione e database;
- solution/project, NuGet, test e profiling.

## Regole operative

Abilita nullable e warning rigorosi. Non bloccare artificialmente task asincroni; propaga cancellazione e timeout. Gestisci il lifecycle delle risorse, riusa `HttpClient` tramite factory e mantieni il dominio separato da framework/UI.

## Sicurezza

Autorizzazione per policy e risorsa, model binding con allow-list, query parametrizzate, protezione dati/chiavi della piattaforma e segreti esterni. Evita deserializzazione polimorfica non controllata e process execution costruita da stringhe. Proteggi endpoint diagnostici.

## Progetto di padronanza

Crea una API ASP.NET Core con dominio separato, autenticazione, autorizzazione per risorsa, EF Core, migrazioni, test di integrazione e logging con correlation ID; aggiungi un client desktop minimale.

## Fonte ufficiale

- [.NET fundamentals](https://learn.microsoft.com/en-us/dotnet/fundamentals/)

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[Paradigmi e design pattern]]
