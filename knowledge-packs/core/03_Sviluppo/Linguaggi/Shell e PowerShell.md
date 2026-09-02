---
title: Shell e PowerShell
type: language
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, bash, powershell, automation]
aliases: []
---

# Shell e PowerShell

## Sintesi

La shell orchestra programmi e sistemi. È eccellente per automazioni brevi e operazioni; quando stato, parsing o dominio crescono, passa a un linguaggio applicativo.

## Bash

Studia quoting, espansioni, exit status, pipe/redirection, array, funzioni, processi e segnali. Usa `set -Eeuo pipefail` consapevolmente: non sostituisce la gestione degli errori. Quota variabili, usa `--` quando supportato, evita parsing di output pensato per umani e verifica con ShellCheck.

## PowerShell

La pipeline trasporta oggetti, non testo. Padroneggia cmdlet, provider, proprietà, `Where-Object`/`ForEach-Object`, funzioni avanzate, moduli, errori terminating/non-terminating, remoting e Pester. Preferisci parametri tipizzati e `-LiteralPath` per path esterni.

## Sicurezza e affidabilità

- non interpolare input in una command line;
- usa array di argomenti o API strutturate;
- valida target assoluti prima di operazioni distruttive;
- supporta `-WhatIf`/dry run;
- rendi lo script idempotente;
- limita privilegi e scope del remoting;
- non registrare credenziali o token;
- restituisci codici/esiti coerenti e log strutturati.

## Progetto di padronanza

Crea uno script di audit workstation read-only: inventario, patch, servizi, spazio, rete e log recenti; output JSON/HTML, error handling per singolo controllo e test delle funzioni. Nessuna modifica senza flag esplicito.

## Fonti ufficiali

- [PowerShell documentation](https://learn.microsoft.com/en-us/powershell/)
- [GNU Bash manual](https://www.gnu.org/software/bash/manual/)

## Collegamenti

- [[01_Informatica/Manuale operativo del tecnico IT]]
- [[Sicurezza del software]]
