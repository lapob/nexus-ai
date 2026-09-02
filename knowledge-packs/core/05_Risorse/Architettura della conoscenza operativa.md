---
title: Architettura della conoscenza operativa
type: standard
area: resources
status: evergreen
level: intermediate
visibility: public
created: 2026-08-08
updated: 2026-08-08
source_kind: curated
tags: [knowledge-graph, procedure, strumenti, laboratori]
aliases: [Architettura della knowledge]
---

# Architettura della conoscenza operativa

## Sintesi

La knowledge collega informazioni e azioni attraverso sei livelli distinti:

```text
Concetto → Tecnologia → Strumento → Procedura → Laboratorio → Evidenza
```

Il modello impedisce che una descrizione teorica venga scambiata per autorizzazione operativa e rende più semplice scegliere il livello adatto all’esperienza dell’utente.

## Livelli

- **Concetto:** principio stabile, definizioni e limiti.
- **Tecnologia:** implementazioni, protocolli e compatibilità.
- **Strumento:** capacità locale, versione, input e rischio.
- **Procedura:** sequenza verificabile con prerequisiti e rollback.
- **Laboratorio:** ambiente isolato, obiettivo e risultato atteso.
- **Evidenza:** output, hash, timestamp, log e interpretazione.

## Presentazione progressiva

La modalità semplice mostra scopo, conseguenze, tempo stimato e pulsante di conferma. La modalità avanzata aggiunge parametri, comandi, output grezzo e diagnostica. Le due modalità rappresentano la stessa operazione; non devono divergere nei controlli di sicurezza.

## Retrieval

Una richiesta operativa deve recuperare almeno concetto, procedura e profilo dello strumento. Se manca uno dei tre, Nexus presenta l’informazione disponibile ma non inventa il passaggio mancante.

## Verifica

Ogni catena operativa conserva provenienza, versione e collegamenti. I laboratori non vengono usati come fatti enciclopedici; le evidenze non diventano istruzioni permanenti senza revisione.

## Rischi e limiti

Un grafo ricco non garantisce correttezza. Collegamenti obsoleti o strumenti aggiornati richiedono review periodica e benchmark con query negative.
