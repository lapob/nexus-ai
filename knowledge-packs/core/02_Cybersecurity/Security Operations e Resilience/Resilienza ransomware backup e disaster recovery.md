---
title: Resilienza ransomware backup e disaster recovery
type: reference
area: cybersecurity
status: evergreen
level: advanced
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [ransomware, backup, disaster-recovery, business-continuity]
aliases: [Ransomware resilience]
---

# Resilienza ransomware backup e disaster recovery

La resilienza nasce prima dell'incidente: identità separate, segmentazione, telemetria, copie non modificabili e ripristini provati. Un backup non testato è soltanto una speranza.

## Architettura

Applica una strategia 3-2-1-1-0: almeno tre copie, due supporti, una fuori sede, una offline o immutabile e zero errori nelle verifiche. Separa account e piano di controllo del backup dal dominio produttivo, usa MFA resistente al phishing e limita cancellazione/retention.

## Priorità

Classifica servizi per RTO e RPO; mappa dipendenze come DNS, identità, certificati, repository, hypervisor e configurazioni. Prepara un minimum viable business che funzioni anche senza parte dell'infrastruttura primaria.

## Durante l'incidente

Attiva ruoli e canali fuori banda; conserva evidenze; limita propagazione senza distruggere la possibilità di capire la causa; proteggi backup e console; valuta obblighi legali e comunicazione. Non avviare ripristini sopra un ambiente ancora controllato dall'attaccante.

## Ripristino affidabile

Stabilisci una clean room, ricostruisci identity e trust root, convalida immagini e configurazioni, ruota credenziali, ripristina per dipendenze e monitora recidiva. Ogni restore test misura tempo, completezza, integrità applicativa e capacità del personale.

## Tabletop e prove tecniche

Esegui esercitazioni trimestrali con indisponibilità simultanea di identity, posta e console di gestione. Alterna tabletop, restore di campioni e full failover controllato. Registra decisioni, assunzioni fallite e azioni con proprietario e scadenza.

## Indicatori utili

Copertura backup, percentuale immutabile, successo restore, età dell'ultima prova, scostamento RTO/RPO, dipendenze non documentate e tempo di revoca degli accessi privilegiati. Il numero di terabyte copiati non misura recuperabilità.
