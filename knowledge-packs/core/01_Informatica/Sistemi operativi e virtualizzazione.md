---
title: Sistemi operativi e virtualizzazione
type: concept
area: tech
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [operating-systems, virtualization, lab]
aliases: [Sistemi operativi]
---

# Sistemi operativi e virtualizzazione

## Modello mentale

Un sistema operativo media tra processi, memoria, storage, dispositivi, identità e rete. Per sviluppo e sicurezza serve saper osservare questi confini, non soltanto usare l'interfaccia.

| Area | Domande operative |
|---|---|
| processi | chi lo ha avviato, con quali privilegi e risorse? |
| filesystem | dove vive il dato, chi può modificarlo, come viene persistito? |
| identità | quale utente, gruppo, token o servizio sta agendo? |
| rete | quali socket ascoltano e quali connessioni escono? |
| log | quale evento dimostra che l'azione è avvenuta? |

## Virtualizzazione per i lab

- host: macchina reale e dati personali, da proteggere;
- hypervisor: confine di gestione delle VM;
- guest: sistema sacrificabile e ripristinabile;
- rete NAT: uscita mediata, non equivale a isolamento;
- host-only/internal: utile per target deliberatamente vulnerabili;
- snapshot: punto di ripristino, non backup dei dati importanti.

## Baseline minima

- aggiornamenti e immagini da fonti ufficiali;
- account non amministrativo per il lavoro normale;
- cifratura del disco e password manager;
- snapshot prima di modifiche invasive;
- cartelle condivise e clipboard disattivate quando non servono;
- nessun bridge verso la LAN durante test offensivi;
- inventario di VM, IP, credenziali di test e scopo.

## Verifica

- [ ] So distinguere host, guest e confini di rete.
- [ ] Posso ricreare una VM da note e checksum.
- [ ] Dimostro che un target isolato non raggiunge la LAN personale.
- [ ] So raccogliere processi, porte e log su Windows e Linux.

## Collegamenti

- [[Linux/Indice - Linux|Linux]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze|Standard laboratorio]]
