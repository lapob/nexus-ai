---
title: Manuale enciclopedico dell’informatica e della cybersecurity
type: book
area: home
status: evergreen
level: foundation
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [manuale, informatica, cybersecurity, libro]
aliases: [Riferimento generale di informatica e cybersecurity]
---

# Manuale enciclopedico dell’informatica e della cybersecurity

Riferimento generale che collega i capitoli specialistici di informatica, sistemi, sviluppo software e cybersecurity.

> [!tip] Da dove iniziare
> Usa [[Percorsi di studio e competenze professionali]] per seguire un curriculum progressivo con prove, progetti e criteri di padronanza.

## Capitoli trasversali essenziali

- [[Matematica per informatica AI dati e sicurezza]]
- [[Elettronica pratica sensori alimentazione e diagnostica]]
- [[Product UX accessibilita e design delle interfacce]]
- [[Ingegneria del software manutenzione e rilascio]]
- [[Privacy etica e gestione responsabile dei dati]]

## Metodo

Ogni parte segue quattro passaggi:

1. **modello mentale** — spiegare componenti e relazioni;
2. **operatività** — osservare e modificare un laboratorio;
3. **internals** — comprendere astrazioni, limiti e failure mode;
4. **prova** — produrre progetto, test, evidenza e retrospettiva.

La selezione di un comando richiede documentazione, delimitazione dello scope e verifica dell’esito; la memorizzazione isolata non è sufficiente.

## Parte I — Come pensa un computer

### 1 · Informazione

Bit, byte, basi numeriche, codifica, interi, floating point, Unicode, compressione, hash e serializzazione.

**Capitolo:** [[01_Informatica/Computer Science/Architettura dei calcolatori e rappresentazione dei dati|Architettura e dati]]

**Prova:** converti valori tra basi, spiega un errore floating point, ispeziona i byte di un file e confronta hash.

### 2 · Hardware

CPU, istruzioni, registri, cache, RAM, bus, interrupt, DMA, storage, GPU, firmware e boot.

**Capitolo:** [[01_Informatica/Embedded IoT e Hardware/Hardware PC firmware UEFI storage e diagnostica|Hardware e firmware]]

### 3 · Algoritmi

Correttezza, invarianti, strutture dati, costo tempo/spazio, ricerca, ordinamento, grafi e compromessi.

**Capitolo:** [[03_Sviluppo/Algoritmi e strutture dati|Algoritmi e strutture dati]]

**Prova:** implementa due soluzioni allo stesso problema e confrontale con test e benchmark.

## Parte II — Sistemi operativi

### 4 · Kernel, processi e memoria

Processi, thread, scheduler, syscall, memoria virtuale, filesystem, driver, IPC, concorrenza e isolamento.

**Capitolo:** [[01_Informatica/Computer Science/Sistemi operativi concorrenza e memoria|Concorrenza e memoria]]

### 5 · Windows, Linux, macOS, BSD e mobile

Confronta kernel, userland, packaging, servizi, sicurezza e strumenti.

**Capitolo:** [[01_Informatica/Sistemi Operativi/Indice - Sistemi Operativi|Sistemi operativi]]

### 6 · Amministrazione

Utenti, processi, servizi, log, storage, rete, aggiornamenti, backup, recovery e automazione.

**Capitolo:** [[01_Informatica/Manuale operativo del tecnico IT|Manuale del tecnico IT]]

**Laboratorio:** prepara due VM, introduci un guasto controllato, raccogli evidenze, ripristina e scrivi il runbook.

## Parte III — Reti e Internet

### 7 · Dal link al socket

Ethernet, ARP/NDP, IP, subnet, routing, NAT, ICMP, TCP, UDP, socket e MTU.

**Capitolo:** [[01_Informatica/Networking/Fondamenti di rete|Fondamenti di rete]]

### 8 · Servizi

DNS, DHCP, HTTP, TLS, SSH, proxy, firewall, VPN, PKI e tempo.

**Capitolo:** [[01_Informatica/Networking/DNS DHCP PKI e troubleshooting dei servizi di rete|DNS DHCP PKI]]

### 9 · Diagnostica

Verifica in ordine: link → indirizzo → route → DNS → trasporto → TLS → applicazione.

**Capitolo:** [[01_Informatica/Networking/Diagnostica e analisi di rete|Diagnostica di rete]]

**Prova:** racconta una richiesta HTTPS tramite DNS, handshake, header, log e cattura pacchetti.

## Parte IV — Programmazione

### 10 · Fondamenti

Valori, tipi, controllo, funzioni, moduli, errori, I/O, stato, mutabilità, concorrenza e contratti.

**Capitolo:** [[03_Sviluppo/Linguaggi/Fondamenti di programmazione|Fondamenti di programmazione]]

### 11 · Paradigmi

Procedurale, object-oriented, funzionale, data-oriented, event-driven, concorrente e dichiarativo.

**Capitolo:** [[03_Sviluppo/Paradigmi e design pattern|Paradigmi e pattern]]

### 12 · Linguaggi

Python, JavaScript/TypeScript, Java/Kotlin, .NET, Go, Rust, C/C++, SQL e shell sono strumenti con trade-off diversi.

**Indice:** [[03_Sviluppo/Linguaggi/Indice - Linguaggi|Linguaggi]]

**Pratica:** [[03_Sviluppo/Esempi di programmazione/Indice - Esempi di programmazione|Esempi confrontati]]

## Parte V — Web, app e interfacce

### 13 · Piattaforma web

1. [[03_Sviluppo/HTML/HTML semantico accessibile e verificabile|HTML]]
2. [[03_Sviluppo/CSS/CSS moderno responsive e design system|CSS]]
3. [[03_Sviluppo/JavaScript/JavaScript browser asincronia sicurezza e test|JavaScript browser]]
4. [[03_Sviluppo/Web frontend accessibile performante e sicuro|Frontend professionale]]

### 14 · API e backend

Contratti, REST, GraphQL, gRPC, WebSocket, validazione, auth, idempotenza, resilienza e osservabilità.

**Capitolo:** [[03_Sviluppo/APIs/Indice - APIs|API]]

### 15 · Mobile e desktop

Lifecycle, stato, storage, offline, permessi, distribuzione e accessibilità.

**Capitolo:** [[03_Sviluppo/Mobile/Indice - Mobile Development|Mobile Development]]

## Parte VI — Dati

### 16 · Database

Relazioni, normalizzazione, indici, transazioni, isolamento, query plan, backup e replica.

**Capitolo:** [[01_Informatica/Database e Data/Database relazionali progettazione e tuning|Database relazionali]]

### 17 · Dati distribuiti

Document, key-value, cache, search, stream, schema evolution, qualità, retention e governance.

**Capitolo:** [[01_Informatica/Database e Data/Indice - Database e Data|Database e Data]]

## Parte VII — Ingegneria del software

### 18 · Requisiti e architettura

Stakeholder, requisiti verificabili, quality attributes, ADR, confini, dipendenze ed evoluzione.

**Capitolo:** [[03_Sviluppo/Architettura Software/Indice - Architettura Software|Architettura software]]

### 19 · Testing

Unità, integrazione, contract, end-to-end, property, fuzzing, performance, accessibilità e sicurezza.

**Capitolo:** [[03_Sviluppo/Testing e qualita del software|Testing e qualità]]

### 20 · Delivery

Versionamento, review, CI/CD, artifact, SBOM, deployment, osservabilità e rollback.

**Capitolo:** [[01_Informatica/Cloud SRE e Platform/Platform engineering CI CD e supply chain|Platform engineering]]

## Parte VIII — Cloud e sistemi distribuiti

### 21 · Distribuzione

Tempo, failure parziali, retry, timeout, idempotenza, code, cache, consistenza e partizionamento.

**Capitolo:** [[03_Sviluppo/Architettura Software/Sistemi distribuiti resilienza e consistenza|Sistemi distribuiti]]

### 22 · Cloud e infrastruttura

IAM, rete, compute, storage, IaC, container, Kubernetes, costi e responsabilità condivisa.

**Capitolo:** [[01_Informatica/Cloud SRE e Platform/Indice - Cloud SRE e Platform|Cloud SRE Platform]]

### 23 · Affidabilità

SLI, SLO, error budget, capacity, alert, incidenti, backup e disaster recovery.

**Capitolo:** [[01_Informatica/Cloud SRE e Platform/Reliability engineering SLO error budget e postmortem|Reliability engineering]]

## Parte IX — Cybersecurity

### 24 · Modello operativo

Asset, threat, vulnerabilità, rischio, controllo, trust boundary, least privilege e defense in depth.

**Capitolo:** [[02_Cybersecurity/Fondamenti/Indice - Fondamenti|Fondamenti]]

### 25 · Difesa

Hardening, logging, SIEM, detection, hunting, incident response, forensics e recovery.

**Capitolo:** [[02_Cybersecurity/Blue Team/Indice - Blue Team|Blue Team]]

### 26 · Sicurezza applicativa

Threat modeling, secure SDLC, review, dipendenze, auth, input/output, segreti, API e supply chain.

**Capitolo:** [[02_Cybersecurity/Application Security/Indice - Application Security|Application Security]]

### 27 · Ethical hacking autorizzato

Scope, ricognizione, assessment, prova minima, evidenza, finding, remediation, cleanup e retest.

**Capitolo:** [[02_Cybersecurity/Ethical Hacking/Procedure di assessment autorizzato e validazione difensiva|Procedure di assessment autorizzato]]

**Pratica:** [[02_Cybersecurity/Labs/Indice - Labs|Cyber lab]]

## Parte X — Crittografia, identità e privacy

### 28 · Crittografia

Randomness, hash, MAC, cifratura, firma, KDF, TLS, PKI, rotazione e gestione chiavi.

**Capitolo:** [[02_Cybersecurity/Crittografia/Indice - Crittografia|Crittografia]]

### 29 · Identità

Authentication, authorization, federation, MFA, lifecycle, Kerberos, OAuth, OIDC, SAML e PAM.

**Capitolo:** [[02_Cybersecurity/Identity Windows e Active Directory/Indice - Identity Windows e Active Directory|Identity]]

## Parte XI — AI

### 30 · Machine learning e LLM

Dati, training, validation, inference, token, context, sampling, quantizzazione ed evaluation.

**Capitolo:** [[01_Informatica/AI/Indice - AI|AI]]

### 31 · RAG e agenti

Chunk, embedding, retrieval, citazioni, memoria, tool use, consenso, sandbox e prompt injection.

**Capitoli:** [[01_Informatica/AI/RAG embeddings memoria e knowledge graph|RAG]] e [[01_Informatica/AI/Agenti tool use pianificazione e consenso|Agenti]]

### 32 · Assistenti AI locali

Un assistente locale integra interfaccia, voce, modelli, knowledge base, azioni controllate e sicurezza.


## Parte XII — Professione

### 33 · Troubleshooting

Definisci sintomo e baseline, riduci le ipotesi, cambia una variabile, misura, ripristina e documenta.

**Capitolo:** [[05_Risorse/Metodo professionale per comandi procedure e troubleshooting|Metodo professionale]]

### 34 · Progetti

Un progetto vale quando è riproducibile, testato, sicuro, osservabile e spiegabile.


### 35 · Aggiornamento

Versioni, standard e vulnerabilità cambiano. Conserva fonti, data, laboratorio, decisioni e limiti.

**Capitolo:** [[05_Risorse/Qualita e manutenzione della Vault|Manutenzione]]

## Architettura di riferimento integrata

Un sistema completo comprende client accessibile, API, database, coda, deployment riproducibile, monitoraggio, threat model, test, backup e ripristino, simulazione degli incidenti e assessment autorizzato. Gli artefatti associati includono codice, ADR, runbook, evidenze e report tecnici.

## Consultazione

- [[Indice enciclopedico per materie]]
- [[05_Risorse/Glossario|Glossario]]
- [[05_Risorse/Riferimenti operativi/Indice dei comandi|Indice comandi]]
- [[Catalogo degli scenari tecnici]]
