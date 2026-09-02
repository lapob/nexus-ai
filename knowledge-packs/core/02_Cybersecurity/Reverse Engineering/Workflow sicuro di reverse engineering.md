---
title: Workflow sicuro di reverse engineering
type: reference
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-27
updated: 2026-08-08
source_kind: curated
tags: [cybersecurity, reverse-engineering, malware-analysis, lab]
aliases: [Workflow reverse engineering]
rag: true
---

# Workflow sicuro di reverse engineering

## Confini

Analizzare esclusivamente file propri, campioni didattici o artefatti per cui
esiste autorizzazione. Usare un host sacrificabile, snapshot e rete isolata.

## Flusso

1. Calcolare hash e registrare origine, data e catena di custodia.
2. Eseguire triage statico: formato, architettura, sezioni, import, stringhe,
   firma e indicatori di packing.
3. Costruire ipotesi prima dell'esecuzione.
4. Analizzare in VM con snapshot, strumenti monitorati e traffico controllato.
5. Correlare comportamento di processo, filesystem, registry e rete.
6. Tornare al disassemblato/decompilato sui punti osservati.
7. Documentare finding, livello di confidenza e riproducibilità.

## Strumenti per categoria

- formati e metadati: `file`, `readelf`, `objdump`, PE viewers;
- static analysis: Ghidra, Cutter/radare2;
- debugging: x64dbg, WinDbg, GDB;
- comportamento: Process Monitor, Process Explorer, Wireshark;
- regole: YARA per classificazione e condivisione controllata.

## Output professionale

- hash e ambiente;
- timeline;
- capacità osservate e non soltanto sospette;
- IOC distinti da comportamenti durevoli;
- mapping ATT&CK motivato;
- limiti dell'analisi e azioni difensive.
