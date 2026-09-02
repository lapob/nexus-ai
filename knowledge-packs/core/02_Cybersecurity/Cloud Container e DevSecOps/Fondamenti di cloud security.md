---
title: Fondamenti di cloud security
type: note
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-28
updated: 2026-08-08
source_kind: curated
tags: [cloud-security, iam, logging, devsecops]
aliases: [Cloud security]
---

# Fondamenti di cloud security

## Modello mentale

Il provider protegge l'infrastruttura del servizio; il cliente resta
responsabile di identità, configurazioni, dati, workload e uso corretto delle
funzioni offerte. Il confine cambia tra IaaS, PaaS e SaaS.

## Baseline

- organizzazioni, account e subscription separati per ambiente;
- identità federate, MFA resistente al phishing e niente account condivisi;
- ruoli temporanei e privilegi minimi;
- nessun servizio pubblico senza requisito esplicito;
- cifratura, classificazione dati e gestione centralizzata delle chiavi;
- log di controllo immutabili e inviati fuori dall'account workload;
- inventario continuo di asset, owner, esposizione e scadenze;
- backup isolati con restore provato;
- policy-as-code, scanning IaC e review;
- runbook per credenziali compromesse e chiavi esposte.

## Verifica IAM

1. chi può autenticarsi;
2. quale ruolo può assumere;
3. quali azioni sono consentite;
4. su quali risorse e con quali condizioni;
5. quale percorso indiretto amplia i privilegi;
6. quale log dimostra l'uso del permesso.

## Errori ricorrenti

- storage pubblico o condiviso per errore;
- wildcard in azioni e risorse;
- secret nelle variabili di pipeline o nei log;
- chiavi statiche senza scadenza;
- security group aperti globalmente;
- snapshot e backup non protetti;
- audit disabilitato o senza retention;
- ambienti di test collegati alla produzione.

## Laboratorio sicuro

Usa un account dedicato, budget e alert di costo, dati sintetici, regioni
limitate e teardown automatico. Non testare tecniche offensive su tenant o
risorse non espressamente incluse nello scope.

## Collegamenti

- [[Baseline Kubernetes e supply chain]]
- [[02_Cybersecurity/Fondamenti/Threat Modeling]]
- [[02_Cybersecurity/Governance Rischio e Compliance/NIST CSF 2.0 operativo.md]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze|Standard di laboratorio]]
