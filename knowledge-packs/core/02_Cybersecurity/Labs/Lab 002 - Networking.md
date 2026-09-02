---
title: Lab 002 - Networking
type: lab
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: lab
tags: [networking, lab, troubleshooting]
aliases: []
verification_scope: isolated-laboratory
---

# Lab 002 - Networking

## Autorizzazione e ambiente

Usa due VM possedute, su rete host-only/internal. Non scansionare la LAN o indirizzi pubblici. Registra hypervisor, sistemi, subnet e snapshot.

## Obiettivi

- prevedere rete, gateway e host da una subnet;
- distinguere errore di link, route, DNS, TCP e applicazione;
- correlare comando, pacchetto e log.

## Procedura

1. Disegna topologia e assegna indirizzi statici.
2. Raccogli `ip addr`, `ip route` e `ss -lntup`.
3. Verifica gateway e peer per indirizzo.
4. Aggiungi un nome locale e confronta risoluzione corretta/errata.
5. Avvia un server HTTP di test su una VM.
6. Osserva handshake TCP e richiesta HTTP con Wireshark.
7. Rompi una sola variabile: route, DNS o listener. Diagnostica senza sapere quale.

## Evidenze

| Ipotesi | Controllo | Risultato | Conclusione |
|---|---|---|---|
| | | | |

- diagramma e tabella IP;
- estratto PCAP minimizzato;
- timeline della diagnosi;
- spiegazione del livello in cui si trovava il guasto.

## Cleanup

- arresta listener;
- rimuovi configurazioni temporanee;
- ripristina snapshot;
- verifica che la rete di lab non raggiunga la LAN.

## Collegamenti

- [[01_Informatica/Networking/Fondamenti di rete|Fondamenti di rete]]
- [[01_Informatica/Networking/Diagnostica e analisi di rete|Diagnostica rete]]
- [[Standard laboratorio e raccolta evidenze]]
