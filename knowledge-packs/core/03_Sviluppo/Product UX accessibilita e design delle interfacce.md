---
title: Product, UX, accessibilità e design delle interfacce
type: manuale
area: product-design
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [product, ux, ui, accessibilita, design]
aliases: [Product UX e accessibilita]
---

# Product, UX, accessibilità e design delle interfacce

## Sintesi

Un’interfaccia riuscita rende evidente cosa sta accadendo, cosa può fare l’utente e come recuperare da un errore.

## Dal bisogno al prodotto

1. definire utente, problema e risultato misurabile;
2. osservare il flusso reale, non soltanto le preferenze dichiarate;
3. scrivere scenari e criteri di accettazione;
4. prototipare il percorso minimo;
5. testare con persone e dispositivi differenti;
6. misurare efficacia, errori, tempo e soddisfazione;
7. iterare mantenendo coerenza e compatibilità.

## Gerarchia visiva

Usare dimensione, contrasto, posizione e spazio per indicare priorità. Limitare colori e stili, mantenere una scala tipografica, allineare su una griglia e progettare stati vuoto, caricamento, successo, errore e offline.

## Accessibilità

- HTML semantico e ordine di lettura corretto;
- navigazione completa da tastiera;
- focus chiaramente visibile;
- etichette accessibili e messaggi comprensibili;
- contrasto sufficiente senza affidarsi soltanto al colore;
- supporto a zoom, testo grande e movimento ridotto;
- target cliccabili adeguati;
- test con screen reader e dispositivi reali.

## Responsive e prestazioni

Progettare per contenuto e capacità, non per pochi modelli di schermo. Provare finestre strette, Full HD, QHD, ultrawide, scale DPI differenti e input touch. Animazioni e WebGL devono degradare progressivamente senza bloccare testo e controlli.

## Checklist di rilascio

- il percorso primario è completabile senza mouse;
- nessun contenuto essenziale è tagliato;
- errori e permessi spiegano conseguenze e recupero;
- preferenze persistono;
- operazioni lente mostrano avanzamento;
- lo stato non viene perso chiudendo un overlay;
- telemetria e dati personali rispettano il consenso.

## Collegamenti

- [[HTML semantico accessibile e verificabile]]
- [[CSS moderno responsive e design system]]
- [[Testing e qualita del software]]
- [[Requisiti ADR e progettazione evolutiva]]
