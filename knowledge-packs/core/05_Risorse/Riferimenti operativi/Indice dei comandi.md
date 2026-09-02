---
title: Indice dei comandi
type: command-index
area: operations
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: curated
tags: [commands, index, troubleshooting, safety]
aliases: [Enciclopedia comandi, Indice comandi]
---

# Indice dei comandi

Nessuna lista può contenere “ogni comando” senza diventare obsoleta. Questo indice organizza i comandi per intenzione e impone un contratto: prerequisiti, piattaforma, privilegi, effetto, output atteso, rischio, rollback e fonte.

## Regola prima di eseguire

```text
obiettivo → scope esatto → comando read-only → interpreta output
→ anteprima/dry-run → backup o rollback → esecuzione → verifica
```

Non incollare comandi sconosciuti come amministratore. Non costruire shell command con input non fidato. Non usare wildcard o variabili non risolte per cancellazioni.

## Navigazione per piattaforma

- Windows e CMD: [[Windows CMD e amministrazione]]
- PowerShell: [[Comandi PowerShell]]
- Windows internals: [[Windows internals eventi servizi e Sysinternals]]
- Linux: [[Comandi Linux riferimento completo]]
- Bash: [[Comandi Bash]]
- macOS/BSD: [[01_Informatica/Sistemi Operativi/macOS Unix e BSD amministrazione essenziale|macOS Unix BSD]]
- Docker: [[Comandi Docker e Compose]]
- Kubernetes, cloud e IaC: [[Comandi cloud Kubernetes Terraform e Ansible]]
- Git: [[Comandi Git]]
- Python: [[Comandi strumenti Python]]
- Node: [[Comandi Node npm e pnpm]]
- database: [[Comandi SQL]]
- virtualizzazione: [[Virtualizzazione Hyper-V VirtualBox VMware e QEMU]]

## Navigazione per problema

| Problema | Prima osservazione | Approfondimento |
|---|---|---|
| processo bloccato | PID, parent, CPU, I/O, handle | log, dump, profiler |
| memoria alta | working set, commit, trend | heap/profile, leak hypothesis |
| disco pieno | capacità e directory grandi | retention, log, snapshot |
| rete assente | link, indirizzo, route, DNS | TCP, TLS, proxy, firewall |
| servizio non parte | stato ed exit code | dependency, config, event log |
| porta occupata | listener e PID proprietario | command line e lifecycle |
| build fallisce | versione e primo errore | lockfile, cache, toolchain |
| container unhealthy | status e healthcheck | log, events, resource limit |

## Networking e sicurezza

- rete generale: [[01_Informatica/Networking/Comandi Networking - Tech|Comandi Networking]]
- Nmap autorizzato: [[Comandi Nmap]]
- Wireshark: [[Comandi Wireshark]]
- analisi testo: [[Ricerca testo Regex jq sed awk e ripgrep]]
- Kali lab: [[02_Cybersecurity/Kali Linux/Comandi Kali|Comandi Kali]]

I tool di sicurezza richiedono scope autorizzato. Preferisci discovery limitato, rate basso, evidenze minime e verifica manuale.

## Esempio di scheda comando

```markdown
### Get-Process
- Piattaforma: PowerShell
- Scopo: inventario processi read-only
- Privilegi: utente; alcuni dettagli richiedono elevazione
- Esempio: Get-Process | Sort-Object CPU -Descending | Select-Object -First 10
- Output: oggetti Process
- Rischio: basso
- Verifica: confronta Task Manager e timestamp
- Fonte: Microsoft Learn
```

## Collegamenti

- [[05_Risorse/Metodo professionale per comandi procedure e troubleshooting|Metodo professionale]]
- [[01_Informatica/Manuale operativo del tecnico IT|Manuale tecnico IT]]
