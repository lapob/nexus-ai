---
title: Software supply chain, SBOM, provenance e build riproducibili
type: security-guide
area: supply-chain-security
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [supply-chain, sbom, provenance, reproducible-builds, devsecops]
aliases: [Software supply chain security]
---

# Software supply chain, SBOM, provenance e build riproducibili

## Superficie

Sorgente, contributor, workstation, repository, CI runner, dipendenze, registry, compiler, action/plugin, secret, artifact, firma, distribuzione e updater.

## Minacce

- account maintainer compromesso;
- dependency confusion o typosquatting;
- pacchetto legittimo compromesso;
- runner persistente o non isolato;
- secret esposto;
- build non corrispondente al sorgente;
- artifact sostituito;
- updater non autenticato;
- dipendenza abbandonata.

## Controlli repository

Branch protection, review obbligatoria, commit/tag firmati dove appropriato, CODEOWNERS, MFA, token limitati, secret scanning e audit. Una review approva intent e rischio, non solo sintassi.

## Dipendenze

```bash
npm ci
npm audit --omit=dev
pip-audit
cargo audit
dotnet list package --vulnerable
govulncheck ./...
```

Lockfile e hash riducono variabilità ma non provano sicurezza. Valuta provenienza, manutenzione, licenza, transitive dependency e capacità di aggiornamento.

## SBOM

SBOM elenca componenti, versione, relazione e identificatore. Formati comuni includono SPDX e CycloneDX.

```bash
syft dir:. -o cyclonedx-json > sbom.json
syft image:app@sha256:DIGEST -o spdx-json > image-sbom.json
```

Genera SBOM dall’artifact finale oltre che dal repository.

## Scansione

```bash
grype sbom:sbom.json
trivy fs --scanners vuln,secret,misconfig .
trivy image app@sha256:DIGEST
```

Un CVE richiede reachability, configurazione e impatto; una suppressione richiede owner, motivazione e scadenza.

## Provenance e firma

La provenance collega artifact, sorgente, builder, parametri e dipendenze. Firma l’artifact per digest, non per tag mutabile. Proteggi identità di firma e verifica policy in deploy.

## Build riproducibile

Fissa toolchain, dependency, locale, timezone e timestamp; elimina input di rete non dichiarati. Due build indipendenti dovrebbero produrre artifact equivalenti o differenze spiegate.

## CI sicura

- runner effimero;
- permission minime;
- action bloccate per digest;
- environment protetto;
- secret solo nello step necessario;
- output sanificato;
- artifact con retention e accessi;
- separazione build e release;
- approvazione per produzione.

## Scenario tecnico
Genera SBOM di un progetto, individua una dipendenza obsoleta, aggiorna con test, produci artifact e checksum, documenta provenance e verifica che il deploy accetti soltanto il digest approvato.

## Collegamenti

- [[Baseline Kubernetes e supply chain]]
- [[01_Informatica/Cloud SRE e Platform/Platform engineering CI CD e supply chain|Platform engineering]]
- [[03_Sviluppo/Sicurezza del software|Sicurezza del software]]
