---
title: Ingegneria del software, manutenzione e rilascio
type: manuale
area: software-engineering
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [software-engineering, manutenzione, release, qualita]
aliases: [Ingegneria del software]
---

# Ingegneria del software, manutenzione e rilascio

## Ciclo professionale

Una modifica completa comprende comprensione, progettazione, implementazione, test, osservazione e documentazione. “Funziona sul mio PC” non è una condizione di rilascio.

## Organizzazione del codice

- separare dominio, applicazione, infrastruttura e presentazione;
- rendere espliciti contratti e confini di fiducia;
- preferire moduli piccoli con responsabilità coesa;
- eliminare duplicazione soltanto quando l’astrazione è stabile;
- mantenere nomi, errori e logging coerenti;
- non cancellare codice senza verificarne riferimenti, build e comportamento.

## Qualità

La piramide pratica include analisi statica, unit test, contract test, integrazione, smoke test e pochi test end-to-end mirati. Per la grafica aggiungere screenshot a dimensioni rappresentative; per audio e hardware combinare test deterministici con prove su dispositivi differenti.

## Compatibilità

Documentare versioni supportate, migrazioni dei dati e fallback. Salvare configurazioni in forma versionata, validarle all’avvio e preservare i valori sconosciuti quando possono appartenere a una versione più recente.

## Rilascio

1. congelare lo scope;
2. verificare working tree e dipendenze;
3. eseguire suite, audit e build pulita;
4. provare installazione, aggiornamento e disinstallazione;
5. controllare firma, hash e provenienza degli artefatti;
6. pubblicare note di rilascio e procedura di rollback;
7. monitorare crash e regressioni senza raccogliere dati non necessari.

## Debito tecnico

Registrare il debito con impatto e prova concreta. Correggere prima sicurezza, perdita dati, affidabilità e accessibilità; poi prestazioni misurate e infine estetica. Evitare riscritture totali senza una migrazione verificabile.

## Collegamenti

- [[Testing e qualita del software]]
- [[Git operativo e collaborazione]]
- [[Platform engineering CI CD e supply chain]]
- [[Software supply chain SBOM provenance e build riproducibili]]
- [[SRE osservabilita incidenti e continuita]]
