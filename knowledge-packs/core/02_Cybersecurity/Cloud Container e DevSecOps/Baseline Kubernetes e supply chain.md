---
title: Baseline Kubernetes e supply chain
type: reference
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-24
updated: 2026-08-08
source_kind: curated
tags: [cybersecurity, kubernetes, containers, devsecops, supply-chain]
aliases: [Kubernetes security baseline, Baseline container]
---

# Baseline Kubernetes e supply chain

## Modello di controllo

La sicurezza copre codice, dipendenze, pipeline, registry, immagine, configurazione del workload, cluster e runtime. Una scansione dell'immagine non sostituisce identity, segmentazione o osservabilità.

## Immagine e build

- base image minima, versionata e proveniente da registry approvato;
- digest immutabile per deployment riproducibili;
- build multi-stage e nessun secret nei layer;
- processo non-root e filesystem read-only quando possibile;
- SBOM associata all'artefatto;
- SCA e scanning di vulnerabilità con policy documentata;
- firma e verifica della provenance prima della promozione.

Esempio di ispezione:

```bash
docker image inspect nome:tag
docker history --no-trunc nome:tag
docker sbom nome:tag
```

## Workload Kubernetes

Baseline minima:

```yaml
securityContext:
  runAsNonRoot: true
  seccompProfile:
    type: RuntimeDefault
containers:
  - name: app
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
```

Completa con:

- request/limit di CPU e memoria;
- service account dedicato con token non montato se inutile;
- RBAC minimo e nessun binding casuale a `cluster-admin`;
- NetworkPolicy default-deny con allowlist dei flussi;
- secret da secret manager, non da repository o immagini;
- Pod Security Standards e admission policy;
- namespace come confine organizzativo, non come unica barriera.

## Verifiche operative

```bash
kubectl auth can-i --list --as system:serviceaccount:namespace:account
kubectl get clusterrolebindings
kubectl get pods -A -o json
kubectl get networkpolicy -A
kubectl get events -A --sort-by=.lastTimestamp
```

Gli output possono contenere nomi e metadati sensibili: minimizzali e non copiarli in sistemi pubblici.

## Pipeline e risposta

I runner devono essere effimeri o isolati, con permessi minimi e ambienti separati. Blocca dipendenze, valida IaC, firma artefatti e impedisci che una pull request non fidata legga secret. In caso di compromissione: revoca credenziali, sospendi promozioni, conserva log e artefatti, ricostruisci da sorgenti verificati e ripeti la validazione della provenance.

## Collegamenti

- [[Indice - Cloud Container e DevSecOps]]
- [[03_Sviluppo/Sicurezza del software|Sicurezza del software]]
- [[02_Cybersecurity/Fondamenti/Threat Modeling|Threat Modeling]]
- [[05_Risorse/Riferimenti operativi/Comandi Docker e Compose|Docker e Compose]]
