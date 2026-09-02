---
title: Web frontend accessibile, performante e sicuro
type: development-guide
area: frontend
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [frontend, accessibility, performance, security]
aliases: [Frontend engineering]
---

# Web frontend accessibile, performante e sicuro

## Sintesi

Usa HTML semantico, ordine DOM coerente e controlli nativi. Ogni funzione deve essere usabile con tastiera, zoom e tecnologie assistive; il focus deve essere visibile.

## Responsive e stato

Progetta dal contenuto usando layout fluidi, `minmax`, `clamp` e container query quando appropriate. Verifica testo lungo, localizzazione, zoom al 200%, viewport stretto e movimento ridotto.

Mantieni lo stato vicino al consumatore e separa stato server da UI. Per flussi asincroni rendi espliciti `idle`, `loading`, `success`, `empty`, `error` e `cancelled`.

## Prestazioni e sicurezza

Misura prima di ottimizzare. Riduci JavaScript iniziale, suddividi per funzionalità, virtualizza liste grandi e anima proprietà che non causano layout.

- nessun segreto nel bundle;
- output non attendibile reso come testo o sanificato;
- CSP restrittiva e dipendenze controllate;
- cookie di sessione protetti;
- autorizzazione sempre sul server;
- upload validati per contenuto, dimensione e destinazione.

Testa tastiera, errori di rete, caricamento lento, retry, cancellazione, responsive, memoria e bundle.

## Collegamenti

- [[HTML/Indice - HTML|HTML]]
- [[CSS/Indice - CSS|CSS]]
- [[JavaScript/Indice - JavaScript|JavaScript e TypeScript]]
- [[Sicurezza del software]]
