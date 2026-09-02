---
title: Matrici tecniche di riferimento
type: reference
area: resources
status: evergreen
level: advanced
visibility: public
created: 2026-08-08
updated: 2026-08-08
source_kind: curated
tags: [matrices, diagnostics, security, programming, networking]
aliases: [Matrici tecniche]
---

# Matrici tecniche di riferimento

## Linguaggi e toolchain

| Famiglia | Runtime | Build e dipendenze | Debugger | Profiler | Analisi sicurezza |
|---|---|---|---|---|---|
| C/C++ | nativo | CMake, Meson, Conan/vcpkg | GDB, LLDB, WinDbg | perf, VTune, WPA | ASan, UBSan, clang-tidy, fuzzing |
| Rust | nativo | Cargo | GDB, LLDB | perf, cargo-flamegraph | clippy, Miri, cargo-audit |
| JVM | JVM | Maven, Gradle | JDWP, IntelliJ | JFR, async-profiler | SpotBugs, dependency scan |
| .NET | CLR | dotnet, NuGet | VS, netcoredbg | dotnet-trace, PerfView | analyzers, package audit |
| JavaScript/TS | V8/SpiderMonkey/Node | npm, pnpm | DevTools, Node inspector | DevTools, clinic | ESLint, runtime schema, audit |
| Python | CPython/PyPy | pip, uv, Poetry | pdb, debugpy | cProfile, py-spy | Ruff, Bandit, pip-audit |

## Protocolli e diagnostica

| Protocollo | Porta tipica | Negoziazione | Failure mode | Evidenza |
|---|---:|---|---|---|
| DNS | 53 UDP/TCP, 853, 443 | query, referral, risposta | timeout, NXDOMAIN, split horizon, DNSSEC | dig, log resolver, capture |
| DHCP | 67/68 UDP | DORA | pool esaurito, relay, VLAN errata | lease, log server, capture |
| TLS | dipende dal servizio | ClientHello, ServerHello, certificato, chiavi | SNI, trust chain, clock, cipher | openssl, browser, capture |
| SSH | 22 TCP | KEX, host key, user auth | fingerprint, ACL, algoritmo, agent | `ssh -vvv`, auth log |
| HTTP | 80/443 | request/response o stream | proxy, cache, auth, timeout | curl, trace, access log |

## Vulnerabilità e verifica

| Classe | Causa | Test controllato | Correzione | Riferimento |
|---|---|---|---|---|
| injection | dati interpretati come codice | input sintetico e query log | API parametrizzate e separazione dati/codice | CWE-74 |
| controllo accessi | decisione assente o client-side | matrice identità-risorsa-azione | autorizzazione server-side deny-by-default | CWE-284 |
| memory safety | lifetime o bounds errati | sanitizer e fuzzing su parser isolato | astrazioni sicure e validazione dimensioni | CWE-119 |
| race condition | stato condiviso non sincronizzato | scheduler/test concorrente | ownership, lock, transazioni, idempotenza | CWE-362 |
| gestione segreti | credenziale in codice, log o artefatto | secret scanning e review build | vault, rotazione, scope minimo | CWE-798 |

## ATT&CK, telemetria e mitigazione

| Obiettivo | Telemetria | Analisi | Mitigazione |
|---|---|---|---|
| esecuzione | process creation, script block, auditd | parent-child, firma, command line | allowlisting, least privilege |
| persistenza | servizi, task, autorun, unit | nuova configurazione e owner | ACL, baseline e review |
| credential access | accessi a store, LSASS, keychain | processo, token, handle, frequenza | isolamento credenziali e MFA |
| lateral movement | autenticazioni, SMB/RDP/SSH | sorgente, account, asset, orario | segmentazione e accesso amministrativo dedicato |
| esfiltrazione | proxy, DNS, flow, storage audit | volume, destinazione, periodicità | egress control e classificazione dati |

## Collegamenti

- [[01_Informatica/Networking/Indice - Networking|Networking]]
- [[02_Cybersecurity/Blue Team/Mappatura attacco difesa detection e validazione|Mappatura attacco-difesa]]
- [[03_Sviluppo/Linguaggi/Toolchain native C C++ Rust Assembly e debugging|Toolchain native]]
