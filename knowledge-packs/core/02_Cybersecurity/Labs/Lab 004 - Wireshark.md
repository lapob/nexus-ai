---
title: Lab 004 - Wireshark
type: lab
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: lab
tags: [wireshark, packet-analysis, lab]
aliases: []
verification_scope: authorized-laboratory
---

# Lab 004 - Wireshark

## Ambiente

Genera traffico esclusivamente tra VM di lab. Le catture possono contenere dati sensibili: limita interfaccia e durata, usa credenziali fittizie e cancella copie inutili.

## Obiettivi

- riconoscere ARP, DNS, handshake TCP, HTTP e TLS;
- ricostruire un flusso;
- distinguere assenza di traffico, reset, timeout ed errore applicativo.

## Procedura

1. Avvia la cattura sull'interfaccia di lab.
2. Genera una query DNS e una richiesta HTTP di test.
3. Filtra `dns`, `tcp` e `http`.
4. Segui uno stream TCP e crea una timeline.
5. Ripeti verso una porta chiusa e una filtrata.
6. Confronta PCAP con log del server.

## Evidenza

| Timestamp | Pacchetto/evento | Interpretazione | Log correlato |
|---|---|---|---|
| | | | |

Annota filtro, numero di frame e conclusione; non salvare segreti nella nota.

## Collegamenti

- [[01_Informatica/Networking/Diagnostica e analisi di rete|Diagnostica e analisi di rete]]
- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Assessment e monitoraggio]]
- [[05_Risorse/Riferimenti operativi/Comandi Wireshark|Comandi Wireshark]]
