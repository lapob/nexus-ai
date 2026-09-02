---
title: Mappatura attacco, difesa, detection e validazione
type: security-guide
area: blue-team
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [defense, detection, attack-mapping, validation]
aliases: [Attack defense mapping]
---

# Mappatura attacco, difesa, detection e validazione

## Modello

Per ogni scenario documenta:

1. asset e obiettivo dell’avversario;
2. prerequisiti e percorso di accesso;
3. telemetria disponibile;
4. preventive control;
5. detective control;
6. risposta e contenimento;
7. test sicuro e criterio di successo.

## Matrice pratica

| Fase | Prevenzione | Telemetria | Detection |
|---|---|---|---|
| accesso iniziale | patching, filtro, MFA | proxy, mail, WAF, identity | anomalie allegati, URL, login |
| esecuzione | allowlisting, macro policy | process creation, script log | parent-child e command line |
| persistenza | minimo privilegio | servizi, task, autorun | nuove persistenze e modifiche |
| privilege escalation | hardening, LAPS/PAM | token, logon, policy | assegnazioni e processi elevati |
| credential access | protezione LSASS/segreti | EDR, accessi vault | accessi anomali a credenziali |
| discovery | segmentazione | DNS, processi, directory | enumerazione ad alto volume |
| lateral movement | tiering, firewall | SMB, RDP, WinRM, SSH | origini e account inconsueti |
| collection/exfiltration | DLP, egress control | file, proxy, flow | staging, compressione, volume |

## Detection engineering

Definisci sorgente, schema, query, baseline, esclusioni, severità e playbook. Testa con eventi sintetici o emulazione autorizzata, misura precisione e tempo di rilevamento, poi versiona regola e test.

Una regola senza telemetria affidabile non è una difesa. Una detection rumorosa consuma attenzione: correggi la causa, non aggiungere esclusioni generiche.

## Purple team

Seleziona una tecnica, concorda una simulazione minima, osserva sensori e pipeline, misura ciò che è arrivato e migliora prevenzione/detection. Non eseguire payload distruttivi o persistenza reale quando un evento benigno equivalente è sufficiente.

## Collegamenti

- [[Threat Hunting e Detection Engineering]]
- [[SIEM log analysis e regole di detection]]
- [[02_Cybersecurity/Ethical Hacking/Tecniche e toolchain di penetration test autorizzato|Toolchain autorizzata]]
