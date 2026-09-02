---
title: Comandi Nmap
type: reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-07-23
source_kind: curated
tags: [nexus, resources]
aliases: []
---

# Comandi Nmap

Riferimento operativo per scansioni Nmap di base e intermedie in ambienti propri, lab o target esplicitamente autorizzati.

## Collegamenti Correlati

- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Nmap Base]]
- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Scanning]]
- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Enumeration]]
- [[02_Cybersecurity/Labs/Lab 003 - Nmap|Lab 003 - Nmap]]
- [[02_Cybersecurity/Kali Linux/Comandi Kali|Comandi Kali]]
- [[01_Informatica/Networking/Comandi Networking - Tech|Comandi Networking]]

## Tabella Comando -> Descrizione

| Comando | Descrizione |
|---|---|
| `nmap target` | Scansione base delle porte comuni. |
| `nmap -sV target` | Rileva versioni dei servizi. |
| `nmap -sC target` | Esegue script default NSE. |
| `nmap -p- target` | Scansiona tutte le porte TCP. |
| `nmap -p 22,80,443 target` | Scansiona porte specifiche. |
| `nmap -Pn target` | Salta host discovery. |
| `nmap -oN file.txt target` | Salva output normale. |
| `nmap -oA nome target` | Salva output in piu formati. |

## Comandi Essenziali

```bash
nmap target
nmap -sV target
nmap -sC -sV target
nmap -p- target
nmap -p 22,80,443 target
nmap -oN scan.txt target
```

## Esempi Pratici

### Scansione base

```bash
nmap 192.168.1.10
```

### Servizi e versioni

```bash
nmap -sC -sV 192.168.1.10
```

### Tutte le porte TCP

```bash
nmap -T3 -p- 192.0.2.10
```

Una scansione completa può essere rumorosa e pesante. Concorda rate, finestra e criterio di stop.

### Salvare risultati

```bash
nmap -sC -sV -oA scans/target 192.168.1.10
```

## Errori Comuni

- Scansionare target non autorizzati.
- Usare subito `-A` senza capire cosa sta facendo.
- Dimenticare di salvare l'output.
- Non ripetere una scansione mirata sulle porte trovate aperte.
- Confondere host non raggiungibile con host protetto da firewall.

## Indicazioni operative

- Nei lab seguire: discovery, porte, versioni, enumerazione.
- Collegare sempre i risultati alla nota lab, ad esempio [[02_Cybersecurity/Labs/Lab 003 - Nmap|Lab 003 - Nmap]].
