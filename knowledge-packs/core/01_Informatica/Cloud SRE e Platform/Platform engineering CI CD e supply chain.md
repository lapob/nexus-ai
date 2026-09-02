---
title: Platform engineering, CI/CD e supply chain
type: professional-guide
area: platform-engineering
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [platform, cicd, supply-chain]
aliases: []
---

# Platform engineering, CI/CD e supply chain

## Sintesi

Una piattaforma interna offre golden path self-service senza nascondere
ownership. Trattarla come prodotto: utenti, API, documentazione, SLO, feedback e
metriche di adozione.

## Pipeline

Commit → lint/typecheck → unit test → build riproducibile → SAST/SCA/secret
scan → integration test → firma e attestazione → staging → policy gate →
deployment progressivo → verifica → promozione o rollback.

Artefatto build-once, promote-many. Configurazione separata dall'immagine.
Credenziali workload temporanee. Runner effimeri e isolati. Branch protection e
review per cambi sensibili.

## Supply chain

- lockfile e hash;
- dipendenze minime e aggiornate;
- SBOM;
- provenance e firme;
- registry controllato;
- scansione immagini e IaC;
- policy di eccezione con scadenza;
- riproducibilità e retention degli artefatti.

Deployment rolling, blue-green e canary hanno rischi diversi. Database e code
richiedono compatibilità durante la finestra mista. Verificare rollback prima
della produzione.
