---
title: Elettronica pratica, sensori, alimentazione e diagnostica
type: manuale
area: hardware
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [elettronica, hardware, embedded, diagnostica, sicurezza]
aliases: [Elettronica pratica]
---

# Elettronica pratica, sensori, alimentazione e diagnostica

## Sicurezza prima del circuito

Lavorare inizialmente soltanto a bassissima tensione. Scollegare alimentazione e batterie prima di modificare un circuito. Rete elettrica, alimentatori aperti, condensatori ad alta tensione e batterie danneggiate richiedono competenza e strumenti professionali.

## Concetti fondamentali

- tensione come differenza di potenziale;
- corrente come flusso di carica;
- resistenza e legge di Ohm: `V = R × I`;
- potenza: `P = V × I`;
- serie, parallelo, partitori e pull-up/pull-down;
- analogico, digitale, PWM, ADC e DAC;
- massa comune, rumore, filtraggio e disaccoppiamento.

## Componenti

Resistori limitano corrente e definiscono livelli; condensatori accumulano energia e filtrano; diodi impongono una direzione; transistor e MOSFET commutano o amplificano; regolatori stabilizzano alimentazione. Leggere sempre datasheet, pinout, limiti assoluti e condizioni operative.

## Bus e sensori

- **GPIO:** ingressi e uscite semplici;
- **UART:** collegamento seriale punto-punto;
- **I²C:** bus indirizzato a due fili;
- **SPI:** bus rapido con clock e selezione periferica;
- **CAN:** comunicazione robusta in ambienti automotive e industriali.

## Metodo diagnostico

1. ispezione visiva e odore di surriscaldamento;
2. verifica di polarità, continuità e cortocircuiti a circuito spento;
3. controllo dell’alimentazione con limitazione di corrente;
4. misura dei rail dal punto di ingresso verso il carico;
5. verifica di clock, reset e comunicazioni;
6. confronto con schema e datasheet;
7. modifica di una sola variabile e annotazione del risultato.

## Progetti sicuri

- sensore ambientale con logging locale;
- monitor di temperatura del PC;
- pulsantiera USB;
- analizzatore logico su un proprio prototipo;
- dashboard domestica isolata dalla rete pubblica.

## Collegamenti

- [[Fondamenti embedded firmware e protocolli hardware]]
- [[Hardware PC firmware UEFI storage e diagnostica]]
- [[Assessment wireless e IoT autorizzato]]
- [[C e C++]]
