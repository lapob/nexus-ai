---
title: Guida operativa alla cybersecurity
type: roadmap
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [cybersecurity, roadmap, ethical-hacking]
aliases: [Roadmap cybersecurity]
---

# Guida operativa alla cybersecurity

## Sintesi

> [!warning] Regola fondamentale
> Esegui scansioni, exploit e test soltanto su sistemi tuoi o con autorizzazione esplicita e perimetro documentato. Se il perimetro è ambiguo, fermati.

## Blocco A — Fondamenta

- sistemi Windows/Linux, identità, processi, servizi e log;
- TCP/IP, DNS, HTTP/TLS e architettura applicativa;
- Python/PowerShell/Bash, Git e SQL;
- [[Fondamenti/Indice - Fondamenti|rischio e threat modeling]].

**Evidenza:** diagramma di rete, inventory, script di raccolta e threat model.

## Blocco B — Difesa prima dell'offesa

- [[Blue Team/Indice - Blue Team|telemetria, triage e incident response]];
- hardening, patching, backup e least privilege;
- query su log e detection con falsi positivi misurati;
- mappatura di comportamento con ATT&CK senza usarlo come checklist.

**Evidenza:** timeline di incidente simulato, detection e runbook.

## Blocco C — Assessment autorizzato

- [[Ethical Hacking/Regole di ingaggio e reporting|regole di ingaggio]];
- asset discovery, enumerazione e validazione manuale;
- web/API, rete e identità in lab;
- impatto minimo, cleanup, report e retest.

**Evidenza:** report executive e tecnico con remediation verificata.

## Blocco D — Specializzazione

Scegli in base ai progetti, non alla quantità di tool:

- AppSec + web/API;
- detection engineering + DFIR;
- identity/Active Directory;
- cloud/container/DevSecOps;
- reverse engineering/malware;
- wireless/mobile/IoT;
- AI security e agenti.

## Matrice di autovalutazione

Valuta ogni capacità da 0 a 3:

- `0` non riconosco il problema;
- `1` eseguo con guida;
- `2` eseguo e verifico senza guida;
- `3` progetto il metodo, gestisco edge case e insegno.


## Fonti di orientamento

- NIST NICE Framework: linguaggio comune per task, knowledge e skill professionali.
- NIST Cybersecurity Framework: collegare lavoro tecnico a governance e rischio.
- OWASP WSTG/ASVS: test e requisiti di sicurezza applicativa.
- MITRE ATT&CK: conoscenza di tattiche e tecniche osservate.

Vedi [[05_Risorse/Fonti autorevoli e percorsi|Fonti autorevoli e percorsi]].
