---
title: Kali come workstation di laboratorio
type: reference
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [kali, lab, workstation]
aliases: [Setup Kali]
---

# Kali come workstation di laboratorio

## Ruolo

Kali è una workstation con tool preconfezionati. La competenza consiste nel comprendere protocollo, ipotesi, impatto e output, non nel lanciare molti strumenti.

## Setup minimo

- immagine ufficiale e checksum verificato;
- VM con NAT per aggiornamenti e rete interna separata per i target;
- utente non privilegiato;
- snapshot `clean`, `updated` e pre-esperimento;
- data/ora sincronizzata per correlare evidenze;
- nessuna credenziale reale o cartella personale condivisa;
- note con versione di sistema e tool.

## Workflow

1. leggi autorizzazione e scope;
2. prepara directory per sessione, note ed evidenze;
3. formula ipotesi;
4. esegui il test meno invasivo;
5. verifica manualmente;
6. minimizza e cifra le evidenze;
7. cleanup e ripristino.

## Tool selection

Scegli per domanda: Nmap per reachability/porte/servizi, Wireshark/tcpdump per pacchetti, Burp/ZAP per traffico web, non per “provare tutto”. Documenta sempre perché il tool è adeguato e quali falsi positivi può produrre.

## Collegamenti

- [[Comandi Kali]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze|Standard laboratorio]]
- [[02_Cybersecurity/Ethical Hacking/Regole di ingaggio e reporting|Regole di ingaggio]]
