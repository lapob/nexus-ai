---
title: Comandi Kali
type: reference
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: curated
tags: [nexus, cybersecurity]
aliases: []
---

# Comandi Kali

## Sintesi

Raccolta operativa di comandi Kali Linux per aggiornamento, sistema, rete e laboratorio cybersecurity.

## Collegamenti Correlati

- [[02_Cybersecurity/Kali Linux/Kali come workstation di laboratorio]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze]]
- [[01_Informatica/Linux/Comandi Linux|Comandi Linux]]
- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Nmap Base]]
- [[02_Cybersecurity/Labs/Lab 001 - Linux|Lab 001 - Linux]]
- [[02_Cybersecurity/Labs/Lab 003 - Nmap|Lab 003 - Nmap]]

## Concetti Chiave

- Kali e una distribuzione Debian-based orientata a test di sicurezza autorizzati.
- Molti comandi sono identici a Linux standard, con in piu tool specializzati.
- Tenere Kali aggiornata riduce errori, incompatibilita e problemi nei lab.
- Separare comandi di sistema, diagnostica e strumenti offensivi aiuta a non confondere gli appunti.

## Aggiornamento Sistema

```bash
sudo apt update
sudo apt upgrade
sudo apt full-upgrade
sudo apt autoremove
```

## Informazioni Sistema

```bash
uname -a
hostnamectl
lsb_release -a
whoami
id
groups
```

## Rete

```bash
ip a
ip route
ping -c 4 8.8.8.8
ss -tulpn
```

## Pacchetti

```bash
apt search nome-tool
apt show nome-tool
sudo apt install nome-tool
sudo apt remove nome-tool
```

## Tool Kali

```bash
kali-tweaks
searchsploit --help
man nmap
apropos packet
```

Un risultato di `searchsploit` è un riferimento, non autorizza l'esecuzione e non dimostra che il target sia vulnerabile.

## Nmap Base

```bash
nmap target
nmap -sV target
nmap -T3 -p 22,80,443 target
nmap -oA evidenze/scan target
```

## Web e HTTP

```bash
curl -I https://example.com
curl -v https://example.com
whatweb https://example.com
```

## File e Wordlist

```bash
ls /usr/share/wordlists
find /usr/share -type f -iname "*wordlist*"
gzip -l file.gz
```

Evita dati reali e non usare wordlist contro servizi fuori dallo scope.

## Processo Lab

```text
1. Definire target autorizzato
2. Raccogliere informazioni
3. Eseguire scansione base
4. Annotare risultati
5. Collegare note e comandi usati
```

## Indicazioni operative

- Usare questa nota come riferimento rapido durante i lab.
- Documentare i risultati in [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze]] o nella nota lab specifica.
