---
title: Metodologia di test web
type: methodology
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: standard
tags: [web-security, api-security, owasp]
aliases: [Web security testing]
---

# Metodologia di test web

## Prima del test

Conferma scope, ruoli, account, ambienti, dati vietati, rate limit e tecniche escluse. Se possibile usa staging con dati sintetici.

## Mappa

1. componenti, host, API e dipendenze;
2. endpoint, metodi e formati;
3. identità, ruoli e transizioni di sessione;
4. input, output, upload e integrazioni;
5. trust boundary e operazioni sensibili.

## Categorie di verifica

- configurazione, deployment e information disclosure;
- identità, autenticazione, sessione e autorizzazione;
- validazione input, injection e output encoding;
- logica di business e race condition;
- crittografia, transport security e gestione segreti;
- file, deserializzazione, SSRF e dipendenze;
- API, GraphQL, WebSocket e client-side.

OWASP Top 10 è awareness, non una checklist completa. Usa WSTG per scenari di test e ASVS per requisiti verificabili, indicando la versione.

## Finding

Una prova valida collega richiesta, risposta, ruolo, prerequisiti e impatto. Minimizza l'azione: non estrarre più dati e non ottenere più privilegi di quanto autorizzato per dimostrare la condizione.

## Fonti

- OWASP Foundation, “Web Security Testing Guide”, v4.2 stabile; sviluppo v5.0, https://owasp.org/www-project-web-security-testing-guide/, consultato il 2026-07-23.
- OWASP Foundation, “Application Security Verification Standard”, v5.0.0, https://owasp.org/www-project-application-security-verification-standard/, consultato il 2026-07-23.
