---
title: Threat intelligence e attack surface management
type: reference
area: cybersecurity
status: evergreen
level: advanced
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [threat-intelligence, asm, osint, exposure-management]
aliases: [CTI e ASM]
---

# Threat intelligence e attack surface management

La cyber threat intelligence trasforma osservazioni in decisioni. L'attack surface management mantiene invece un inventario continuo di ciò che l'organizzazione espone davvero. Nessuno dei due coincide con una raccolta indiscriminata di dati.

## Ciclo operativo

1. Definisci decisione, stakeholder, perimetro e scadenza.
2. Raccogli soltanto fonti pertinenti e registra provenienza, data e affidabilità.
3. Normalizza entità: dominio, IP, certificato, hash, identità, vulnerabilità e tecnica.
4. Valuta attendibilità della fonte e confidenza dell'informazione separatamente.
5. Collega l'osservazione ad asset, controllo, detection o azione di riduzione del rischio.
6. Scarta indicatori scaduti e misura quali decisioni sono migliorate.

## Livelli di intelligence

- **Strategica:** attori, motivazioni, dipendenze e rischio per il business.
- **Operativa:** campagne, infrastrutture, finestre temporali e obiettivi.
- **Tattica:** tecniche MITRE ATT&CK, prerequisiti e telemetria utile.
- **Tecnica:** indicatori fragili come IP, domini e hash, sempre con TTL e contesto.

## Tool e formati

MISP e OpenCTI gestiscono relazioni e condivisione; STIX/TAXII rappresentano oggetti e trasporto; VirusTotal, urlscan, passive DNS e certificate transparency arricchiscono un'ipotesi nel rispetto di privacy e condizioni d'uso. Amass, Subfinder, Shodan, Censys e scanner autorizzati aiutano l'inventario esterno. CMDB, cloud inventory e EDR forniscono la vista interna.

## Attack surface management

Per ogni asset conserva proprietario, criticità, ambiente, origine, esposizione, autenticazione, dati trattati, patch state e data dell'ultima verifica. Deduplica CDN, reverse proxy e asset effimeri. Una porta aperta è un'osservazione; diventa rischio solo dopo aver identificato servizio, controllo compensativo, raggiungibilità e impatto.

## Evidenze e qualità

Ogni finding deve contenere fonte, timestamp, query sanitizzata, asset confermato, confidenza, possibile falso positivo, scadenza e responsabile. Evita attribuzioni basate su un singolo indicatore: infrastrutture e tool vengono riutilizzati.

## Laboratorio sicuro

Costruisci un inventario di domini e servizi posseduti, confrontalo con DNS, certificati e cloud inventory, quindi simula la comparsa di un asset dimenticato. L'output è una procedura di ownership e chiusura, non una scansione di terzi.
