---
title: Tecniche e toolchain di penetration test autorizzato
type: security-guide
area: ethical-hacking
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [penetration-testing, tools, methodology, authorized]
aliases: [Toolchain penetration test]
---

# Tecniche e toolchain di penetration test autorizzato

## Sintesi

> [!important]
> Usa queste tecniche solo con autorizzazione scritta, scope, finestra, contatti di emergenza e regole di ingaggio. Nei laboratori usa target deliberatamente vulnerabili e dati sintetici.

## Ciclo operativo

1. pre-engagement e threat model;
2. asset discovery e validazione dello scope;
3. ricognizione passiva e attiva controllata;
4. enumerazione di servizi, identità e applicazioni;
5. validazione manuale delle ipotesi;
6. prova d’impatto minima e reversibile;
7. cleanup, evidenze, finding e retest.

## Famiglie di tecniche

| Dominio | Obiettivo | Evidenza utile | Difesa associata |
|---|---|---|---|
| rete | esposizione, segmentazione, servizi | endpoint, porta, protocollo, banner verificato | firewall, segmentazione, hardening |
| web/API | auth, sessione, input, business logic | richiesta/risposta minimizzata | authz server-side, validazione, logging |
| identity | privilegi, trust, lifecycle | relazione identità-risorsa | MFA, tiering, review, PAM |
| cloud | IAM, storage, rete, secret | policy e configurazione | guardrail, CSPM, least privilege |
| wireless | configurazione e separazione | standard, cifratura, isolamento | WPA moderno, 802.1X, monitoring |
| mobile | storage, IPC, rete, backend | configurazione e comportamento | sandbox, Keystore/Keychain, pinning ragionato |
| host | patch, servizi, ACL, persistenza | configurazione e versione | hardening, EDR, allowlisting |

## Catalogo strumenti

- **Nmap/Masscan:** discovery e mapping; limita rate e reti.
- **Wireshark/tcpdump:** osservazione protocolli ed evidenze.
- **Burp Suite/ZAP/mitmproxy:** proxy di test per applicazioni autorizzate.
- **Nuclei/Nessus/OpenVAS:** verifica basata su template o scanner; conferma manualmente.
- **ffuf/feroxbuster:** content discovery con rate limit e wordlist pertinente.
- **testssl.sh/sslyze:** configurazione TLS.
- **BloodHound/PingCastle:** relazioni e posture AD in assessment concordati.
- **Semgrep/CodeQL/linters:** analisi statica.
- **Trivy/Grype/Syft:** immagini, dipendenze e SBOM.
- **Ghidra/radare2/x64dbg:** reverse engineering in laboratorio.
- **Volatility/Autopsy/Velociraptor:** analisi forense e triage.
- **Metasploit:** validazione controllata in lab; non è un sostituto della comprensione.

## Regole di uso

Prima di ogni tool annota target esatto, comando/configurazione, velocità, credenziali consentite, dati che potrebbe raccogliere e stop condition. Salva versione e timestamp. Distingui `informational`, falso positivo, configurazione debole e vulnerabilità sfruttabile.

## Finding

Titolo, asset, requisito violato, prerequisiti, evidenza sanificata, impatto realistico, probabilità, causa radice, correzione, compensating control e procedura di retest.

## Collegamenti

- [[Regole di ingaggio e reporting]]
- [[Metodologia penetration test]]
- [[Workflow assessment infrastrutturale autorizzato]]
- [[02_Cybersecurity/Blue Team/Mappatura attacco difesa detection e validazione|Mappatura difensiva]]
