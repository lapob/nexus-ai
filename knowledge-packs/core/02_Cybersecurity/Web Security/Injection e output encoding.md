---
title: Injection e output encoding
type: concept
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [web-security, injection, xss, sqli]
aliases: [SQL Injection, XSS]
---

# Injection e output encoding

## Causa comune

L'injection nasce quando dati non fidati vengono interpretati come istruzioni da un parser: SQL, shell, template, LDAP, browser o altro interprete.

## Difese

- API parametrizzate e query preparate;
- niente concatenazione di comandi;
- validazione per formato e significato;
- output encoding contestuale per HTML, attributi, URL e JavaScript;
- template con escaping sicuro per default;
- Content Security Policy come difesa aggiuntiva, non primaria;
- privilegi minimi e separazione degli account;
- test automatici su input ostili.

## SQL injection

La parametrizzazione separa struttura della query e dati. Allowlist per identificatori dinamici; escaping manuale è fragile. Il database deve usare un account con soli privilegi necessari.

## Cross-site scripting

Stored, reflected e DOM-based descrivono dove il dato entra e viene eseguito. La correzione dipende dal sink e dal contesto; sanitizzazione e encoding non sono intercambiabili.

## Metodo di verifica

In un lab autorizzato identifica source, trasformazioni, sink e contesto. Dimostra con un marker innocuo e osservabile, poi verifica che il fix impedisca l'interpretazione senza rompere input legittimo.
