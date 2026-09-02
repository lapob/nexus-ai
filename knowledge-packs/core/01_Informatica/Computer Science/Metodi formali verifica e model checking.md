---
title: Metodi formali, verifica e model checking
type: guide
area: computer-science
status: evergreen
level: advanced
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [metodi-formali, verifica, model-checking, logica]
aliases: [formal methods]
---

# Metodi formali, verifica e model checking

I metodi formali descrivono un sistema con matematica abbastanza precisa da dimostrare proprietà o cercare automaticamente controesempi. Non sostituiscono test, review e osservabilità: coprono classi di errori che gli esempi spesso non raggiungono, soprattutto in protocolli concorrenti, autorizzazioni e componenti critici.

## Modello mentale

- **Specifica**: stati, transizioni, invarianti e proprietà temporali.
- **Verifica deduttiva**: precondizioni, postcondizioni e prove assistite.
- **Model checking**: esplorazione finita degli stati per trovare una traccia che viola una proprietà.
- **Refinement**: passaggio controllato da modello astratto a implementazione.
- **Runtime verification**: controllo di proprietà su eventi reali senza pretendere una prova completa.

Safety significa “qualcosa di vietato non accade”; liveness significa “qualcosa di desiderato prima o poi accade”. Un modello corretto del sistema sbagliato non dà garanzie utili: assunzioni, confini e ambiente devono essere espliciti.

## Percorso pratico

1. Scegli un componente piccolo: coda, lock, workflow di approvazione o protocollo di leader election.
2. Elenca stati e azioni, poi scrivi invarianti verificabili.
3. Modella guasti e concorrenza, non soltanto il percorso felice.
4. Usa property-based testing per collegare invarianti e codice.
5. Applica TLA+/PlusCal o Alloy al protocollo; usa Dafny, Lean o Coq quando serve una prova più vicina al programma.
6. Conserva il controesempio come test di regressione.

## Criteri di qualità

Una specifica utile dichiara fairness, granularità atomica, limiti numerici e comportamento dei guasti. Le proprietà hanno nomi leggibili e ogni assunzione è collegata a un controllo nell'implementazione o nell'ambiente operativo.

## Limiti e rischi

L'esplosione degli stati impone astrazioni. Una prova non copre bug del compilatore, hardware, configurazione o specifica incompleta. Nei sistemi ad alto impatto servono revisione indipendente, tracciabilità e assurance multilivello.

## Collegamenti

- [[Matematica discreta logica e calcolabilita]]
- [[Sistemi operativi concorrenza e memoria]]
- [[03_Sviluppo/Testing e qualita del software|Testing e qualità del software]]

## Fonti primarie

- Leslie Lamport, *Specifying Systems*, https://lamport.azurewebsites.net/tla/book.html
- Alloy documentation, https://alloytools.org/documentation.html
- Lean documentation, https://lean-lang.org/documentation/
