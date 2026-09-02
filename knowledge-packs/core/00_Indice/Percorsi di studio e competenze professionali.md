---
title: Percorsi di studio e competenze professionali
type: index
area: home
status: evergreen
level: foundation
visibility: public
created: 2026-08-08
updated: 2026-08-08
source_kind: curated
tags: [percorsi, competenze, informatica, cybersecurity, programmazione]
aliases: [Percorsi professionali]
---

# Percorsi di studio e competenze professionali

Questa pagina trasforma la knowledge base in un curriculum progressivo. Un capitolo non è “completato” quando è stato letto: occorre saper spiegare il modello, svolgere una prova riproducibile, diagnosticare un errore e produrre un artefatto verificabile.

## Metodo di studio

Per ogni modulo conserva quattro risultati: appunti sintetici, laboratorio isolato, evidenza dell’esito e retrospettiva. Ripeti gli esercizi senza copiare i comandi; consulta i riferimenti quando serve. Versioni, date e fonti primarie fanno parte dell’evidenza.

| Livello | Capacità attesa | Prova |
|---|---|---|
| Fondamenta | descrive componenti, dati e confini | diagramma e spiegazione senza strumenti |
| Operatività | usa tool e procedure in sicurezza | laboratorio con prerequisiti e rollback |
| Diagnosi | distingue sintomo, causa ed evidenza | troubleshooting a ipotesi controllate |
| Progettazione | confronta alternative e trade-off | progetto, test, ADR e threat model |
| Padronanza | affronta casi nuovi e insegna il metodo | scenario integrato e revisione critica |

## Percorso A — Informatica e sistemi

1. [[01_Informatica/Computer Science/Indice - Computer Science|Computer science e architettura]]
2. [[01_Informatica/Sistemi Operativi/Indice - Sistemi Operativi|Sistemi operativi]]
3. [[01_Informatica/Linux/Indice - Linux|Linux]] e [[01_Informatica/Windows/Indice - Windows|Windows]]
4. [[01_Informatica/Networking/Indice - Networking|Reti e protocolli]]
5. [[01_Informatica/Database e Data/Indice - Database e Data|Database e dati]]
6. [[01_Informatica/Cloud SRE e Platform/Indice - Cloud SRE e Platform|Cloud, SRE e piattaforme]]

**Progetto finale:** due servizi su sistemi differenti, rete documentata, accesso SSH con chiavi, logging centralizzato, backup verificato, monitoraggio e procedura di recovery.

## Percorso B — Programmazione e ingegneria del software

1. [[03_Sviluppo/Linguaggi/Fondamenti di programmazione|Fondamenti di programmazione]]
2. [[03_Sviluppo/Algoritmi e strutture dati|Algoritmi e strutture dati]]
3. [[03_Sviluppo/Linguaggi/Indice - Linguaggi|Linguaggi e runtime]]
4. [[03_Sviluppo/Paradigmi e design pattern|Paradigmi e pattern]]
5. [[03_Sviluppo/Testing e qualita del software|Testing e qualità]]
6. [[03_Sviluppo/Architettura Software/Indice - Architettura Software|Architettura software]]
7. [[03_Sviluppo/Processo di sviluppo sicuro|Processo di sviluppo sicuro]]

**Progetto finale:** applicazione accessibile con API, database, autenticazione, test, pipeline, telemetria, SBOM, documentazione e rollback.

## Percorso C — Cybersecurity difensiva

1. [[02_Cybersecurity/Fondamenti/Indice - Fondamenti|Rischio e threat modeling]]
2. [[02_Cybersecurity/Network Security/Indice - Network Security|Network security]]
3. [[02_Cybersecurity/Application Security/Indice - Application Security|Application security]]
4. [[02_Cybersecurity/Blue Team/Indice - Blue Team|Detection, hunting e incident response]]
5. [[02_Cybersecurity/Digital Forensics e Malware Analysis/Indice - Digital Forensics e Malware Analysis|Digital forensics e malware analysis]]
6. [[02_Cybersecurity/Cloud Container e DevSecOps/Indice - Cloud Container e DevSecOps|Cloud e DevSecOps security]]

**Progetto finale:** threat model, baseline di hardening, raccolta log, cinque detection testate, simulazione di incidente, timeline, contenimento e postmortem.

## Percorso D — Ethical hacking autorizzato

1. [[02_Cybersecurity/Ethical Hacking/Regole di ingaggio e reporting|Regole di ingaggio]]
2. [[02_Cybersecurity/Ethical Hacking/Metodologia penetration test|Metodologia]]
3. [[02_Cybersecurity/Ethical Hacking/OSINT e ricognizione autorizzata|Ricognizione autorizzata]]
4. [[02_Cybersecurity/Web Security/Indice - Web Security|Web e API security]]
5. [[02_Cybersecurity/Ethical Hacking/Procedure di assessment autorizzato e validazione difensiva|Procedure e validazione]]
6. [[02_Cybersecurity/Labs/Indice - Labs|Laboratori isolati]]

> [!important]
> Tutte le prove offensive richiedono autorizzazione scritta, scope esplicito, stop condition, contatti, finestra operativa e cleanup. Fuori da questi confini si studiano architetture e difese, non si eseguono test.

**Progetto finale:** assessment di un laboratorio intenzionalmente vulnerabile con evidenza minima, catena di rischio, correzione, detection associata e retest.

## Percorso E — Apple, Android e mobile

1. [[01_Informatica/Sistemi Operativi/macOS Unix e BSD amministrazione essenziale|Amministrazione macOS]]
2. [[01_Informatica/Sistemi Operativi/Android internals amministrazione e diagnostica|Android internals e diagnostica]]
3. [[03_Sviluppo/Mobile/Apple Swift SwiftUI iOS e macOS|Sviluppo Apple]]
4. [[03_Sviluppo/Mobile/Android Kotlin architettura build e debugging|Sviluppo Android]]
5. [[02_Cybersecurity/Wireless Mobile e IoT/Sicurezza mobile Android e iOS|Sicurezza mobile]]

**Progetto finale:** stessa applicazione su due piattaforme con storage protetto, deep link verificati, rete sicura, accessibilità, test, firma e checklist di rilascio.

## Registro delle competenze

Per ogni prova annota `data`, `ambiente`, `versione`, `obiettivo`, `procedura`, `evidenza`, `limiti`, `rollback` e `prossimo passo`. Il livello dichiarato deve essere sostenuto da artefatti ripetibili, non dal numero di tool conosciuti.

## Consultazione rapida

- [[Manuale enciclopedico dell informatica e della cybersecurity|Manuale enciclopedico]]
- [[Indice enciclopedico per materie|Indice per materie]]
- [[05_Risorse/Riferimenti operativi/Indice dei comandi|Indice dei comandi]]
- [[05_Risorse/Glossario|Glossario]]
