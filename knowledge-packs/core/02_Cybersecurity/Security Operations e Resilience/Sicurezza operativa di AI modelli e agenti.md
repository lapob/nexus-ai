---
title: Sicurezza operativa di AI modelli e agenti
type: reference
area: cybersecurity
status: evergreen
level: advanced
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [ai-security, prompt-injection, agents, model-supply-chain]
aliases: [AI Security Operations]
---

# Sicurezza operativa di AI modelli e agenti

Un modello non è un confine di sicurezza. Prompt, output, documenti recuperati e risposte dei tool sono dati non fidati; autorizzazione e policy devono vivere in codice deterministico esterno al modello.

## Superfici principali

- prompt injection diretta e indiretta in pagine, documenti e messaggi;
- data poisoning della knowledge e memoria persistente;
- tool con permessi eccessivi, confused deputy e azioni non reversibili;
- esfiltrazione attraverso output, URL, log o chiamate laterali;
- modelli, adapter, tokenizer e runtime compromessi nella supply chain;
- denial of wallet/compute e contesti costruiti per degradare il servizio.

## Controlli

Separa istruzioni da contenuto, mantieni allowlist di tool e argomenti, valida input/output con schema, limita filesystem e rete, usa token monouso e richiedi consenso per impatti rilevanti. Mostra diff, destinazione e conseguenza prima dell'azione. La memoria accetta soltanto contenuti approvati, senza credenziali.

## RAG e knowledge

Registra provenienza, versione e livello di fiducia; segmenta dati pubblici, privati e sensibili; impedisci che una fonte recuperata cambi policy; cita l'evidenza; applica ACL prima del retrieval. Valuta poisoning, documenti contraddittori e istruzioni nascoste.

## Supply chain dei modelli

Verifica hash e provenienza, usa formati sicuri, isola conversione e caricamento, inventaria licenza e dataset dichiarati, conserva SBOM del runtime e limita codice remoto. Un file di modello è un artefatto non fidato fino alla verifica.

## Evaluation

Costruisci test per injection, escalation, segreti, azioni simulate, ambiguità, lingue diverse e interruzioni. Misura successo dell'attacco, falsi rifiuti, azioni senza consenso e qualità del recupero. Riesegui le evaluation dopo ogni modifica a prompt, tool, modello o knowledge.

## Risposta agli incidenti AI

Revoca token e tool, congela versioni di modello/prompt/index, conserva audit sanitizzato, identifica dati esposti, invalida memoria contaminata e ripristina da artefatti verificati. Per progettazione ed evaluation vedi [[../../01_Informatica/AI/Evaluation safety e red teaming per AI|Evaluation e red teaming per AI]].
