---
title: Cloud, container e DevSecOps
type: index
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-07-28
source_kind: curated
tags: [cybersecurity, cloud, containers, devsecops]
aliases: []
---

# Cloud, container e DevSecOps

## Cloud

Shared responsibility, IAM e federation, organization/account boundaries, network controls, encryption/KMS, secret management, audit log, posture management, backup e incident response. Studia almeno un provider e poi confronta AWS/Azure/GCP.

## Container e Kubernetes

Immagini minime e non-root, registry e firma, scanning, capability/seccomp, filesystem read-only, secret, namespace, RBAC, NetworkPolicy, admission policy, audit log e runtime detection.

## Pipeline

Branch protection, review, runner isolati, permessi minimi, dipendenze bloccate, SAST/SCA/IaC scan, provenance/SBOM, artifact signing, promozione tra ambienti e rollback verificato. Non esporre segreti nei log o a pull request non fidate.

## Approfondimento operativo

- [[Fondamenti di cloud security]]
- [[Baseline Kubernetes e supply chain]]
- [[Software supply chain SBOM provenance e build riproducibili]]
- [[03_Sviluppo/Sicurezza del software|Sicurezza del software]]
- [[02_Cybersecurity/Fondamenti/Threat Modeling|Threat Modeling]]
