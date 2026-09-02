---
title: OSINT e ricognizione autorizzata
type: note
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-28
updated: 2026-08-08
source_kind: curated
tags: [osint, reconnaissance, ethical-hacking, privacy]
aliases: [Ricognizione autorizzata]
---

# OSINT e ricognizione autorizzata

## Confine

La disponibilità pubblica di un dato non autorizza raccolta indiscriminata,
profilazione personale o test attivi. Regole di ingaggio e normativa definiscono
domini, soggetti, tecniche, orari, retention e modalità di contatto.

## Workflow passivo

1. registra scope e fonti consentite;
2. costruisci inventario di domini e asset dichiarati;
3. raccogli metadati tecnici strettamente necessari;
4. attribuisci confidenza e data a ogni osservazione;
5. verifica con una seconda fonte;
6. separa fatto, ipotesi e falso positivo;
7. minimizza i dati personali;
8. produci finding orientati al rischio.

## Dati utili

- domini, DNS e certificati associati allo scope;
- tecnologie dichiarate e superfici esposte;
- repository e artefatti ufficialmente pubblici;
- documentazione, changelog e status page;
- indirizzi di contatto sicurezza e disclosure policy;
- esposizioni accidentali verificabili senza accesso non autorizzato.

## Stop condition

Fermati se emerge un asset fuori scope, una credenziale, un dato personale non
necessario, un sistema fragile o la necessità di autenticarsi, aggirare controlli
o inviare traffico attivo non autorizzato.

## Evidenza

Conserva URL, timestamp, hash o screenshot sanitizzato, fonte, attendibilità e
impatto. Non archiviare copie complete di dataset o segreti.

## Collegamenti

- [[Regole di ingaggio e reporting]]
- [[Metodologia penetration test]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze]]
- [[02_Cybersecurity/Ethical Hacking/Regole di ingaggio e reporting|Struttura dei finding]]
