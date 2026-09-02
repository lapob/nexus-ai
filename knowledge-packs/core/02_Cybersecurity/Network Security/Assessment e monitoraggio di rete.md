---
title: Assessment e monitoraggio di rete
type: methodology
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [network-security, assessment, monitoring]
aliases: [Assessment di rete]
---

# Assessment e monitoraggio di rete

## Distinzioni

- asset discovery: quali host rispondono;
- port scanning: quali porte sembrano raggiungibili;
- service enumeration: quale protocollo/prodotto potrebbe rispondere;
- vulnerability assessment: quali condizioni note potrebbero applicarsi;
- validation: prova manuale e contestuale;
- monitoring: osservazione continua di eventi e deviazioni.

Ogni passaggio aumenta dettaglio e possibile impatto. Scope, rate e finestre vanno definiti prima.

## Workflow autorizzato

1. importa scope e sistemi esclusi;
2. stabilisci sorgente, rate e criterio di stop;
3. scopri asset con il metodo meno invasivo;
4. valida porte e servizi;
5. confronta con inventory e owner;
6. analizza configurazioni e vulnerabilità;
7. conferma manualmente senza espandere l'impatto;
8. documenta, pulisci e retesta.

## Monitoraggio

Combina flow, DNS, firewall, endpoint e autenticazione. Una detection utile definisce comportamento, fonte dati, logica, baseline, eccezioni, severità e risposta.

## Evidenza

Registra versione tool, comando, timestamp/timezone, sorgente, target, output originale protetto e conclusione. Un banner non basta per attribuire versione o vulnerabilità.

## Lab

- [[02_Cybersecurity/Labs/Lab 003 - Nmap|Lab Nmap]]
- [[02_Cybersecurity/Labs/Lab 004 - Wireshark|Lab Wireshark]]
