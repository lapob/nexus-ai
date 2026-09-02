---
title: Reliability engineering, SLO, error budget e postmortem
type: technical-guide
area: sre
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [sre, slo, error-budget, postmortem, reliability]
aliases: [SLO e postmortem]
---

# Reliability engineering, SLO, error budget e postmortem

## Affidabilità

Un servizio è affidabile quando soddisfa le aspettative degli utenti nel tempo. Availability senza correttezza, latenza o durabilità può essere inutile.

## SLI, SLO e SLA

- SLI: misura osservata;
- SLO: obiettivo interno su una finestra;
- SLA: impegno contrattuale con conseguenze.

Esempio:

```text
SLI = richieste valide con status atteso e latenza < 300 ms
      / richieste valide totali

SLO = 99,9% su finestra mobile di 28 giorni
```

Escludi dal denominatore soltanto traffico chiaramente definito, non gli errori scomodi.

## Error budget

`1 - SLO` è il budget di errore. Se viene consumato troppo rapidamente, riduci change risk e investi in affidabilità.

Burn rate confronta consumo attuale e sostenibile. Alert multi-window riducono rumore: finestra breve rileva incidenti rapidi, lunga conferma impatto.

## Golden signals

Latency, traffic, errors e saturation. Aggiungi correctness e freshness quando il dominio lo richiede. Metriche infrastrutturali senza esperienza utente non bastano.

## Capacity

Definisci domanda, headroom, limite della dipendenza e comportamento in overload. Usa queue limitate, admission control, timeout, backpressure e degradation.

## Incident command

Ruoli:

- incident commander;
- operations lead;
- communications lead;
- scribe;
- subject matter expert.

Mantieni timeline, ipotesi, decisioni e owner. Durante l’incidente privilegia stabilizzazione e comunicazione; la root cause completa viene dopo.

## Postmortem

Struttura:

1. impatto utente;
2. durata e detection;
3. timeline;
4. condizioni contribuenti;
5. cosa ha funzionato/non funzionato;
6. perché i controlli non hanno prevenuto o limitato;
7. azioni con owner, priorità e scadenza;
8. test che proverà il miglioramento.

Evita “errore umano” come causa finale. Analizza interfacce, incentivi, review, automazione, feedback e condizioni operative.

## Game day

Simula failure concordati: dipendenza lenta, nodo perso, DNS indisponibile, secret scaduto, queue piena. Definisci stop condition, osservabilità e rollback prima del test.

## Scenario tecnico
Strumenta un’API locale, definisci SLI/SLO, genera carico e fault controllato, misura burn rate, gestisci incidente simulato e scrivi postmortem con remediation verificabile.

## Collegamenti

- [[SRE osservabilita incidenti e continuita]]
- [[Prestazioni profiling e capacity planning]]
- [[02_Cybersecurity/Blue Team/Incident Response|Incident Response]]
