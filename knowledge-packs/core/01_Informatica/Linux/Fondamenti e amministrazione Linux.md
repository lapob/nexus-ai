---
title: Fondamenti e amministrazione Linux
type: reference
area: tech
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [linux, administration, troubleshooting]
aliases: [Fondamenti Linux]
---

# Fondamenti e amministrazione Linux

## Cosa osservare

- filesystem: `/etc` configurazione, `/var` dati variabili e log, `/home` dati utente, `/proc` vista del kernel;
- identità: UID/GID, gruppi, ownership, permessi e `sudo`;
- processi: PID, parent, ambiente, file descriptor e signal;
- servizi: unit, dipendenze, stato e journal;
- pacchetti: repository, firme, dipendenze e versione installata.

## Flusso di diagnosi

1. descrivi sintomo, risultato atteso e momento di inizio;
2. identifica processo, servizio, porta, file e utente coinvolti;
3. controlla stato e log prima di cambiare configurazione;
4. formula un'ipotesi e modifica una variabile;
5. verifica, registra e prepara rollback.

```bash
id
ps -eo user,pid,ppid,cmd --sort=ppid
systemctl status nome-servizio
journalctl -u nome-servizio --since today
ss -lntup
df -h
free -h
```

## Permessi

`rwx` si interpreta separatamente per proprietario, gruppo e altri. Usa permessi minimi; evita `chmod 777`. Prima di `sudo`, chiedi quale risorsa richiede davvero privilegi e quale impatto produce il comando.

## Gestione pacchetti Debian-based

```bash
sudo apt update
apt policy nome-pacchetto
sudo apt install nome-pacchetto
sudo apt remove nome-pacchetto
```

`update` aggiorna gli indici; `upgrade` modifica pacchetti. Nei lab registra versione e sorgente, perché il comportamento degli strumenti cambia.

## Verifica

- [ ] Spiego ownership e permessi di un file scelto.
- [ ] Trovo il processo associato a una porta.
- [ ] Diagnostico un servizio fallito usando il journal.
- [ ] Applico e annullo una modifica controllata.

## Collegamenti

- [[Comandi Linux]]
- [[SSH]]
- [[02_Cybersecurity/Labs/Lab 001 - Linux|Lab 001 - Linux]]
