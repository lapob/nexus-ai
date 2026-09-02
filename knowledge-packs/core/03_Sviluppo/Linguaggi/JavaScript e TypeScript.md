---
title: JavaScript e TypeScript
type: language
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, web, javascript, typescript]
aliases: []
language: javascript-typescript
---

# JavaScript e TypeScript

## Sintesi

JavaScript è il linguaggio del browser e un runtime diffuso lato server. TypeScript aggiunge analisi statica: riduce errori di modellazione ma non valida automaticamente dati ricevuti da rete, storage o utente.

## Modello mentale

- scope lessicale, closure, prototipi e oggetti;
- valori primitivi, reference e coercizione;
- event loop, call stack, task e microtask;
- Promise e `async/await` modellano asincronia, non parallelismo CPU;
- moduli ESM definiscono confini;
- il DOM è una API mutabile e un confine di sicurezza.

In TypeScript padroneggia `strict`, narrowing, union discriminanti, generics, utility types, `unknown` invece di `any` e tipi orientati agli stati validi.

## Percorso

1. linguaggio, funzioni, array/object e moduli;
2. event loop, errori, fetch, stream e AbortSignal;
3. HTML semantico, CSS, DOM, eventi e accessibilità;
4. TypeScript strict e validazione runtime;
5. Node.js, filesystem, HTTP e process lifecycle;
6. test unit/integration/E2E e profiling;
7. un framework UI solo dopo le Web APIs.

## Toolchain

Usa `package.json`, lockfile versionato, versioni runtime dichiarate, script piccoli e build riproducibile. Riduci dipendenze e controlla script di installazione e provenienza dei pacchetti.

## Sicurezza

Non assegnare input a `innerHTML`; usa API testuali o sanitizzazione adatta. Applica CSP, cookie `HttpOnly`/`Secure`/`SameSite`, protezione CSRF dove necessaria e autorizzazione lato server. Evita token duraturi nel browser. Valida schema e limiti in ingresso; previeni prototype pollution e SSRF.

## Progetto di padronanza

Costruisci una dashboard accessibile in TypeScript che consuma una API, gestisce loading/error/empty state, annulla richieste obsolete e non usa HTML non fidato. Aggiungi backend con schema runtime, authz, rate limit e test E2E del percorso critico.

## Fonte ufficiale

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [MDN Web Docs](https://developer.mozilla.org/)

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[02_Cybersecurity/Web Security/Indice - Web Security|Web Security]]
