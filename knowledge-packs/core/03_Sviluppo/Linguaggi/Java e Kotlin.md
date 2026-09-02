---
title: Java e Kotlin
type: language
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, jvm, java, kotlin]
aliases: []
language: java-kotlin
---

# Java e Kotlin

## Sintesi

Java e Kotlin condividono la JVM e un ecosistema maturo. Java rende molti meccanismi espliciti; Kotlin aggiunge null safety, data/sealed class, extension e coroutine con piena interoperabilità.

## Fondamenti JVM

Tipi e generics, object model, collection, eccezioni, I/O, stream/sequence, class loading, bytecode, garbage collection, memoria e concorrenza. Comprendi immutabilità, equality/hashCode e differenza tra checked e unchecked exception.

Per Kotlin studia tipi nullable, smart cast, scope function senza abuso, sealed hierarchy, coroutine, structured concurrency e confine con API Java.

## Toolchain

Usa Maven o Gradle con versioni riproducibili, struttura standard, test unit/integration, analisi statica e profiling. Il JDK target, la JVM runtime e le dipendenze sono decisioni esplicite.

## Sicurezza

Valida serializzazione e binding, limita reflection, evita deserializzazione nativa non fidata, query parametrizzate e configurazione esterna. In Spring applica autorizzazione anche a livello di metodo/risorsa e limita actuator. Su Android proteggi storage, componenti esportati, deep link e traffico.

## Progetto di padronanza

Crea un servizio JVM con API, dominio separato, persistenza, transazioni e test; realizza una parte in Kotlin e documenta l'interoperabilità. Aggiungi concorrenza con cancellazione e limiti.

## Fonte ufficiale

- [Java Documentation](https://docs.oracle.com/en/java/)
- [Kotlin Documentation](https://kotlinlang.org/docs/home.html)

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[Testing e qualita del software]]
