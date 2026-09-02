---
title: Processo di sviluppo sicuro
type: roadmap
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [programming, secure-development, roadmap]
aliases: [Percorso development]
---

# Processo di sviluppo sicuro

## 1. Linguaggio e strumenti

Scegli Python o JavaScript/TypeScript come linguaggio principale. Impara debugger, package manager, formatter, linter, type checker, test runner e profiler.

**Prova:** CLI piccola con input, errori, test e documentazione.

## 2. Dati e confini

File, database SQL, API e serializzazione. Tratta ogni input esterno come non fidato e definisci schema, limiti e ownership.

**Prova:** servizio con storage, migrazioni e test di integrazione.

## 3. Architettura

Moduli coesi, dipendenze esplicite, configurazione esterna, error model, logging e metriche. Disegna flussi e trust boundary.

**Prova:** diagramma e [[02_Cybersecurity/Fondamenti/Threat Modeling|threat model]] collegati al codice.

## 4. Qualità

Test unitari sui comportamenti, integrazione sui confini, end-to-end sui percorsi critici, property/fuzz test per parser e input complessi.

**Prova:** pipeline locale ripetibile e bug trasformato in regression test.

## 5. Sicurezza e delivery

Least privilege, gestione segreti, dependency review, build riproducibile, aggiornamenti, rollback e telemetria.

**Prova:** security review con finding, fix e retest.

## 6. Portfolio

Porta un progetto da requisito a release. Documenta anche alternative scartate, limiti e cosa cambieresti.
