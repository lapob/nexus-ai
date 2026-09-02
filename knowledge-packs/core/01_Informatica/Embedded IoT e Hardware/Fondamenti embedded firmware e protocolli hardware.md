---
title: Fondamenti embedded, firmware e protocolli hardware
type: technical-guide
area: embedded
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [firmware, microcontroller, iot]
aliases: []
---

# Fondamenti embedded, firmware e protocolli hardware

## Sintesi

Microcontrollore integra CPU, RAM, flash e periferiche; microprocessore richiede
più componenti esterni. Bare metal esegue loop e interrupt; RTOS aggiunge task,
scheduler e primitive temporali. Real-time significa rispettare deadline, non
semplicemente essere veloce.

## Interfacce

GPIO legge/scrive livelli; UART è seriale asincrona; I²C usa bus indirizzato;
SPI è sincrono e full-duplex; CAN è robusto e arbitrato; USB definisce più
livelli e classi. Verificare sempre tensioni, ground, pinout e datasheet prima
del collegamento.

## Firmware

Startup configura clock, memoria e runtime. Interrupt breve, stato condiviso
protetto, watchdog alimentato soltanto da percorso sano. Bootloader e update
devono verificare firma, versione, anti-rollback e recovery.

## Debug e sicurezza

Oscilloscopio e logic analyzer osservano segnali; JTAG/SWD eseguono debug.
Brownout, timing, EMI, wear flash e power loss sono failure mode reali.
Disabilitare debug di produzione quando richiesto, proteggere chiavi con
hardware adeguato e definire secure boot e lifecycle.
