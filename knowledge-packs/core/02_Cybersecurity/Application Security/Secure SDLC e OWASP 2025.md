---
title: Secure SDLC e OWASP Top 10 2025
type: reference
area: cybersecurity
status: verified
level: intermediate
visibility: public
created: 2026-07-27
updated: 2026-08-08
source_kind: official
tags: [cybersecurity, appsec, secure-sdlc, owasp]
aliases: [Secure SDLC, OWASP 2025]
verified_at: 2026-08-08
review_after: 2027-02-08
rag: true
---

# Secure SDLC e OWASP Top 10 2025

## Obiettivo

La sicurezza applicativa non è una scansione finale. È un insieme di requisiti,
decisioni architetturali, controlli nel codice, test e osservabilità distribuiti
lungo tutto il ciclo di vita.

## Ciclo operativo

1. **Requisiti:** dati, attori, confini di fiducia, abuso prevedibile e criteri
   di accettazione della sicurezza.
2. **Design:** threat modeling, riduzione della superficie, least privilege,
   separazione dei ruoli e comportamento sicuro in caso di errore.
3. **Implementazione:** code review, dependency pinning, secret scanning,
   validazione dell'input e output encoding contestuale.
4. **Verifica:** test unitari negativi, SAST, SCA, DAST e test manuali mirati
   alla logica di business.
5. **Rilascio:** artifact firmati, SBOM, configurazione hardened e rollback.
6. **Esercizio:** logging utile, alert, vulnerability management e riesame
   periodico del threat model.

## OWASP Top 10:2025

- A01 Broken Access Control
- A02 Security Misconfiguration
- A03 Software Supply Chain Failures
- A04 Cryptographic Failures
- A05 Injection
- A06 Insecure Design
- A07 Authentication Failures
- A08 Software or Data Integrity Failures
- A09 Security Logging and Alerting Failures
- A10 Mishandling of Exceptional Conditions

La Top 10 è un documento di awareness, non una checklist completa. Per requisiti
verificabili usare ASVS; per il metodo di test usare WSTG.

## Evidenze da conservare

- requisito e rischio collegato;
- commit o componente verificato;
- caso di test riproducibile;
- risultato atteso e osservato;
- owner, scadenza e prova della correzione.

## Fonti

- [OWASP Top 10:2025](https://owasp.org/Top10/)
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/latest/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
