---
title: AWS, Azure e GCP: servizi, identità, rete e operazioni
type: technical-guide
area: cloud
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [aws, azure, gcp, cloud, iam]
aliases: [Cloud provider map]
---

# AWS, Azure e GCP: servizi, identità, rete e operazioni

## Mappa concettuale

| Capacità | AWS | Azure | GCP |
|---|---|---|---|
| identità cloud | IAM / IAM Identity Center | Entra ID / Azure RBAC | Cloud IAM |
| compute VM | EC2 | Virtual Machines | Compute Engine |
| object storage | S3 | Blob Storage | Cloud Storage |
| serverless | Lambda | Functions | Cloud Functions / Run |
| rete virtuale | VPC | Virtual Network | VPC |
| log/audit | CloudTrail/CloudWatch | Activity Log/Monitor | Cloud Audit Logs/Monitoring |
| secret | Secrets Manager | Key Vault | Secret Manager |

I nomi simili non implicano semantica identica. Verifica sempre scope, inheritance, control plane e data plane.

## CLI di orientamento

```bash
aws sts get-caller-identity
aws configure list
az account show
az account list --output table
gcloud auth list
gcloud config list
```

Prima di ogni comando mutativo mostra account, subscription/project, region e risorsa.

## Baseline

- organizzazione multi-account/subscription/project;
- federation e credenziali temporanee;
- MFA e account break-glass monitorati;
- deny/guardrail organizzativi;
- rete privata e ingress/egress espliciti;
- cifratura e key lifecycle;
- log di audit centralizzati e immutabili;
- tag/label, budget e ownership;
- backup e recovery cross-failure-domain.

## Incident response

Preserva log di control plane, snapshot e configurazione; ruota credenziali compromesse senza distruggere evidenze; valuta sessioni e token già emessi. Prepara ruoli forensi prima dell’incidente.

## Collegamenti

- [[Cloud architecture IAM networking e costi]]
- [[02_Cybersecurity/Cloud Container e DevSecOps/Fondamenti di cloud security|Cloud security]]
