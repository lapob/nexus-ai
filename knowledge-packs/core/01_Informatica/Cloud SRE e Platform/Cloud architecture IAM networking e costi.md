---
title: Cloud architecture, IAM, networking e costi
type: professional-guide
area: cloud
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [cloud, iam, networking, finops]
aliases: []
---

# Cloud architecture, IAM, networking e costi

## Shared responsibility

Responsabilità cambia tra IaaS, PaaS e SaaS. Inventaria account, regioni,
servizi, dati e owner. Separare ambienti e blast radius con organizzazioni,
account/progetti e policy.

## IAM

Identità umane e workload distinte; federazione e MFA; credenziali temporanee;
least privilege; separation of duties; break-glass sorvegliato; access review e
audit. Evitare chiavi statiche nei repository e nelle immagini.

## Rete

Segmentare public/private, controllare ingress/egress, usare endpoint privati
quando appropriato, DNS e certificate lifecycle gestiti. Security group e
firewall non sostituiscono autenticazione applicativa.

## Affidabilità

Multi-zone protegge da failure locali; multi-region aumenta complessità di dati,
consistenza e operazioni. Backup separati, immutabili e restore testati.
Infrastructure as Code versionata, reviewata e sottoposta a policy.

## Costi

Tagging, budget, anomaly detection e unit economics. Misurare compute idle,
egress, storage tier, log ingestion e licenze. Autoscaling senza limiti può
scalare anche un bug e il costo.
