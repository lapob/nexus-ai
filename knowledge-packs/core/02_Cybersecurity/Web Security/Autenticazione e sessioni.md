---
title: Autenticazione e sessioni
type: concept
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [web-security, authentication, sessions, authorization]
aliases: [Authentication]
---

# Autenticazione e sessioni

## Confini

- identificazione: dichiarare chi sei;
- autenticazione: dimostrarlo;
- sessione: mantenere il contesto dopo l'autenticazione;
- autorizzazione: decidere cosa puoi fare su una risorsa;
- accounting: registrare azioni rilevanti.

## Verifiche in lab

- enumerazione account e messaggi differenziali;
- password policy, recovery, MFA e rate limit;
- rotazione dell'ID dopo login e cambio privilegio;
- scadenza, logout e revoca server-side;
- cookie `Secure`, `HttpOnly` e `SameSite` coerenti;
- autorizzazione su ogni oggetto e azione, lato server;
- separazione tenant e ruoli;
- eventi di autenticazione e anomalie nei log.

## Errori di modello

Nascondere un pulsante non autorizza; un token valido non implica accesso a ogni oggetto; MFA non compensa recovery debole; JWT non elimina la necessità di revoca, audience, scadenza e gestione chiavi.

## Evidenza

Usa account e dati fittizi. Registra due richieste confrontabili con ruoli diversi e oscura cookie/token.
