---
title: Regole di ingaggio e reporting
type: methodology
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [cybersecurity, pentest, reporting]
aliases: [Rules of engagement]
---

# Regole di ingaggio e reporting

## Prima del test

- autorizzazione verificabile e proprietario del rischio;
- obiettivi e criteri di successo;
- IP, domini, applicazioni, account e ambienti inclusi/esclusi;
- finestre orarie, sorgenti consentite e limiti di traffico;
- tecniche vietate o soggette a conferma;
- regole per social engineering, persistenza e dati;
- contatti, escalation, incident handling e kill switch;
- cifratura, accesso, retention e distruzione delle evidenze;
- cleanup, retest e data di chiusura.

Se asset, ownership o impatto non corrispondono allo scope scritto, interrompi e chiarisci.

## Evidenza utile

ID, asset, timestamp/timezone, prerequisiti, passaggi riproducibili, risultato osservato, impatto, probabilità, severità motivata, prova minimizzata, remediation, riferimenti e stato del retest. Oscura token, password e dati personali.

## Report

Executive summary orientato al rischio; scope e limiti; metodologia; risultati prioritizzati; dettagli tecnici; remediation strategiche; appendici/evidenze. Distingui sempre fatto osservato, inferenza e possibilità teorica.

## Finding

| Campo | Contenuto |
|---|---|
| condizione | ciò che è stato osservato |
| prerequisiti | accesso, ruolo e configurazione necessari |
| impatto | conseguenza credibile nel contesto |
| evidenza | minimo necessario per riprodurre |
| remediation | causa da correggere, non solo sintomo |
| retest | data, versione e risultato |
