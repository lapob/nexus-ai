---
title: Lab 001 - Linux
type: lab
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: curated
tags: [nexus, cybersecurity]
aliases: []
verification_scope: isolated-laboratory
---

# Lab 001 - Linux

## Sintesi

Laboratorio introduttivo per consolidare navigazione, gestione file, permessi, processi e servizi su Linux.

## Collegamenti Correlati

- [[01_Informatica/Linux/Comandi Linux|Comandi Linux]]
- [[01_Informatica/Linux/Fondamenti e amministrazione Linux|Fondamenti e amministrazione Linux]]
- [[02_Cybersecurity/Kali Linux/Comandi Kali|Comandi Kali]]
- [[Standard laboratorio e raccolta evidenze]]

## Obiettivo

Scenario di verifica per navigazione del filesystem, gestione di file e cartelle, permessi, processi e servizi Linux.

## Prerequisiti

- Terminale Linux o Kali Linux funzionante.
- Accesso a un utente normale.
- Possibilita di usare `sudo` solo dove necessario.

## Concetti Chiave

- Il filesystem Linux e gerarchico e parte da `/`.
- I permessi determinano chi puo leggere, scrivere o eseguire un file.
- I processi rappresentano programmi in esecuzione.
- I servizi sono processi gestiti dal sistema, spesso tramite systemd.

## Ambiente

```text
Sistema:
Utente:
Data:
Obiettivo sessione:
```

## Esercizio 1 - Navigazione

```bash
pwd
ls
ls -la
cd ~
cd /
cd -
```

Checklist:

- [ ] So riconoscere la directory corrente.
- [ ] So distinguere file normali, cartelle e file nascosti.
- [ ] So tornare alla home dell'utente.

## Esercizio 2 - File e Cartelle

```bash
mkdir lab-linux
cd lab-linux
touch note.txt
echo "Primo lab Linux" > note.txt
cat note.txt
cp note.txt copia-note.txt
mv copia-note.txt backup-note.txt
```

Checklist:

- [ ] Ho creato una cartella di lavoro.
- [ ] Ho creato e letto un file.
- [ ] Ho copiato e rinominato un file.

## Esercizio 3 - Permessi

```bash
ls -l
chmod 644 note.txt
chmod +x note.txt
stat note.txt
```

Checklist:

- [ ] So leggere permessi, proprietario e gruppo.
- [ ] So modificare permessi base.
- [ ] So quando un file e eseguibile.

## Esercizio 4 - Processi

```bash
ps aux
top
pgrep bash
```

Checklist:

- [ ] So visualizzare i processi.
- [ ] So riconoscere PID, utente e comando.

## Esercizio 5 - Servizi

```bash
systemctl status
systemctl list-units --type=service
systemctl status ssh
```

Checklist:

- [ ] So distinguere processo e servizio.
- [ ] So leggere lo stato di un servizio.

## Esercizio 6 - Diagnostica Base

```bash
whoami
id
hostnamectl
uname -a
df -h
free -h
```

Checklist:

- [ ] So raccogliere informazioni base sul sistema.
- [ ] So controllare disco e memoria.

## Risultati

```text
Comandi riusciti:
Comandi non riusciti:
Errori incontrati:
Soluzioni trovate:
```

## Evidenze e osservazioni

-

## Problemi Incontrati

-

## Prossimi Passi

- Ripassare [[Comandi Linux]].
- Approfondire [[01_Informatica/Linux/Fondamenti e amministrazione Linux|permessi, processi e servizi]].
- Passare a [[Lab 002 - Networking]].
