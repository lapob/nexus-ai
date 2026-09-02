---
title: Paradigmi e design pattern
type: concept
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, architecture, patterns]
aliases: []
---

# Paradigmi e design pattern

## Sintesi

Un paradigma è un modo di modellare il problema; un pattern è una soluzione ricorrente a una pressione concreta. Entrambi devono ridurre il costo del cambiamento. Se aumentano indirezione senza risolvere un problema osservabile, sono debito.

## Paradigmi

| Paradigma | Modello mentale | Utile quando | Rischio |
|---|---|---|---|
| procedurale | sequenza di operazioni | automazioni e flussi lineari | stato globale |
| orientato agli oggetti | oggetti con responsabilità | domini con identità e ciclo di vita | gerarchie profonde |
| funzionale | trasformazioni e dati immutabili | concorrenza e logica pura | astrazione eccessiva |
| dichiarativo | descrivere il risultato | query, configurazione, UI | costo nascosto |
| event-driven | reazione a eventi | sistemi asincroni e disaccoppiati | ordine, duplicati, debugging |
| data-oriented | layout e trasformazioni dei dati | throughput e cache locality | dominio meno leggibile |

I sistemi reali li combinano. Mantieni il nucleo di dominio indipendente dall'I/O e sposta effetti collaterali ai confini.

## Pressione → pattern

| Pressione | Pattern possibile | Domanda di controllo |
|---|---|---|
| algoritmi intercambiabili | Strategy | servono davvero più comportamenti? |
| interfacce incompatibili | Adapter | il confine è stabile e testabile? |
| creazione complessa | Factory/Builder | la costruzione ha invarianti? |
| notifiche a più consumatori | Observer/Event bus | ordine e fallimenti sono definiti? |
| azione serializzabile o annullabile | Command | identità e idempotenza sono chiare? |
| dominio indipendente dallo storage | Repository | evita di nascondere query costose? |
| dipendenze sostituibili | Dependency Injection | il grafo resta comprensibile? |
| tollerare un servizio instabile | timeout/retry/circuit breaker | retry sicuro, limitato e con jitter? |

## Architetture

- **Layered:** UI → applicazione → dominio → infrastruttura. Semplice, ma impedisci dipendenze inverse accidentali.
- **Hexagonal/ports and adapters:** il dominio espone porte; database, rete e UI sono adapter sostituibili.
- **Event-driven:** produttori e consumatori evolvono separatamente; richiede idempotenza, schema versionato, dead-letter queue e osservabilità.
- **Modular monolith:** moduli con confini forti nello stesso deploy; spesso è il miglior punto di partenza.

Un microservizio introduce rete, consistenza distribuita, deployment e osservabilità. Va scelto per autonomia organizzativa o requisiti di scala, non per moda.

## Principi operativi

- alta coesione, accoppiamento ridotto;
- composizione prima dell'ereditarietà;
- dipendenze esplicite;
- interfacce piccole definite dal consumatore;
- stato mutabile confinato;
- errori e timeout parte del contratto;
- operazioni remote progettate per retry e idempotenza;
- decisioni importanti annotate in un ADR.

## Anti-pattern

God object, service locator globale, ereditarietà profonda, repository generico universale, primitive obsession, booleani che cambiano comportamento, singleton con stato, eccezioni usate come flusso normale e “distributed monolith”.

Prima di introdurre un pattern scrivi: problema, forze, alternative, costo operativo e condizione per rimuoverlo.

## Esempio applicativo
Costruisci una piccola applicazione con dominio puro, porta di persistenza, adapter in memoria e adapter SQL. Aggiungi una strategia intercambiabile e un comando idempotente. Testa il dominio senza database e il contratto di entrambi gli adapter.

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[Testing e qualita del software]]
- [[Sicurezza del software]]
