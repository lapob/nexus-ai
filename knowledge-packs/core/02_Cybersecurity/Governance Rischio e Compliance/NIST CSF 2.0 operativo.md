---
title: NIST CSF 2.0 operativo
type: reference
area: cybersecurity
status: verified
level: intermediate
visibility: public
created: 2026-07-27
updated: 2026-08-08
source_kind: official
tags: [cybersecurity, grc, nist-csf, risk]
aliases: [CSF 2 operativo]
verified_at: 2026-08-08
review_after: 2027-02-08
rag: true
---

# NIST CSF 2.0 operativo

## Sintesi

Il CSF 2.0 organizza gli outcome in sei funzioni: **Govern, Identify, Protect,
Detect, Respond, Recover**. Non prescrive un singolo prodotto o controllo:
permette di descrivere lo stato attuale, lo stato obiettivo e le priorità.

## Applicazione pratica

1. Definire missione, servizi critici, stakeholder e risk appetite.
2. Creare un Current Profile basato su evidenze, non percezioni.
3. Definire un Target Profile proporzionato al contesto.
4. Misurare i gap per probabilità, impatto e dipendenze.
5. Assegnare owner, budget, data e metrica.
6. Riesaminare dopo incidenti, cambi architetturali o nuovi obblighi.

## Evidenze minime

- inventario di asset, identità, dati e fornitori;
- decisioni di rischio approvate;
- configurazioni e backup verificati;
- copertura dei log e use case di detection;
- piani, esercitazioni e lesson learned;
- metriche di ripristino e dipendenze di supply chain.

## Metriche utili

- percentuale asset con owner e criticità;
- MFA resistente al phishing sugli account privilegiati;
- tempo per correggere vulnerabilità critiche contestualizzate;
- copertura delle fonti log necessarie;
- MTTD, MTTR e successo dei test di restore;
- eccezioni scadute o senza responsabile.

## Fonti

- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework)
- [CISA Cross-Sector Cybersecurity Performance Goals](https://www.cisa.gov/cybersecurity-performance-goals)
