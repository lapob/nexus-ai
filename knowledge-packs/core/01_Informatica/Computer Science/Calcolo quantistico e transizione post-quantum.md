---
title: Calcolo quantistico e transizione post-quantum
type: guide
area: computer-science
status: evergreen
level: intermediate
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [quantum, post-quantum, crittografia]
aliases: [quantum computing, PQC]
---

# Calcolo quantistico e transizione post-quantum

Un computer quantistico elabora ampiezze complesse tramite circuiti reversibili e produce campioni classici con una misura. Non prova tutte le soluzioni “in parallelo”: il vantaggio nasce da algoritmi che orchestrano interferenza, entanglement e struttura del problema.

## Fondamenti

Il qubit è uno stato normalizzato; porte unitarie lo trasformano e la misura restituisce esiti probabilistici. Il rumore limita profondità e fedeltà dei circuiti NISQ. La correzione d'errore usa molti qubit fisici per ottenere un qubit logico affidabile.

- Shor minaccia RSA e crittografia a curva ellittica su macchine fault-tolerant sufficientemente grandi.
- Grover offre un'accelerazione quadratica della ricerca esaustiva, mitigabile aumentando le dimensioni delle chiavi simmetriche.
- Simulazione quantistica, ottimizzazione e algebra lineare richiedono sempre benchmark contro il miglior metodo classico.

## Migrazione post-quantum

1. inventaria certificati, chiavi, protocolli, firmware e dati con lunga riservatezza;
2. separa l'algoritmo dall'applicazione con crypto-agility;
3. assegna priorità ai dati esposti a “harvest now, decrypt later”;
4. sperimenta ML-KEM e ML-DSA secondo standard e profili ufficiali;
5. misura dimensioni, latenza, compatibilità e failure mode;
6. distribuisci con rollback e osservabilità, evitando algoritmi o parametri artigianali.

## Laboratorio sicuro

Simula piccoli circuiti con Qiskit o Cirq, confronta distribuzioni ideali e rumorose e documenta l'incertezza. Per PQC usa soltanto librerie mantenute e vettori di test ufficiali; non sostituire la crittografia di produzione con prototipi.

## Fonti primarie

- NIST Post-Quantum Cryptography, https://csrc.nist.gov/projects/post-quantum-cryptography
- IBM Quantum Learning, https://quantum.cloud.ibm.com/learning
- Google Quantum AI / Cirq, https://quantumai.google/cirq
