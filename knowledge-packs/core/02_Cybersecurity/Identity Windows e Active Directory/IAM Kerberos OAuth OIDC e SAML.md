---
title: IAM, Kerberos, OAuth, OIDC e SAML
type: security-guide
area: identity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [iam, kerberos, oauth, oidc, saml]
aliases: [Protocolli IAM]
---

# IAM, Kerberos, OAuth, OIDC e SAML

## Sintesi

Identificazione dichiara un’identità; autenticazione la verifica; autorizzazione decide cosa può fare; accounting registra l’attività.

## Kerberos

Il client ottiene un TGT dal KDC, usa il TGT per richiedere un service ticket e presenta il ticket al servizio indicato dallo SPN. Controlla orario, DNS, SPN duplicati, cifrature, delega e account di servizio.

```powershell
klist
setspn -Q HTTP/server.example.local
```

## OAuth, OIDC e SAML

OAuth delega autorizzazione; OIDC aggiunge autenticazione. Per client pubblici usa Authorization Code con PKCE. Valida issuer, audience, firma, scadenza, nonce e redirect URI. Access token e ID token non sono intercambiabili.

SAML scambia assertion firmate tra Identity Provider e Service Provider. Verifica firma, audience, destinatario, tempo e `InResponseTo`.

## Baseline

- MFA resistente al phishing per ruoli critici;
- account amministrativi separati e minimo privilegio;
- identità di servizio gestite;
- revisione periodica di gruppi, ruoli e applicazioni;
- logging di accessi e modifiche;
- procedura di emergenza testata.

## Collegamenti

- [[Hardening e auditing Active Directory]]
- [[02_Cybersecurity/Web Security/Autenticazione e sessioni|Autenticazione e sessioni]]
