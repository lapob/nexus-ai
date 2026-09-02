---
title: Algoritmi e strutture dati
type: concept
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, algorithms, data-structures]
aliases: []
---

# Algoritmi e strutture dati

## Sintesi

Questa materia serve a scegliere una rappresentazione dei dati che renda semplici, corrette e prevedibili le operazioni più frequenti. Non va studiata come una raccolta di esercizi da colloquio: è uno strumento per progettare software, analizzare colli di bottiglia e riconoscere input ostili.

## Metodo di analisi

Per ogni soluzione annota:

1. dimensione dell'input e operazione dominante;
2. invariante che deve restare vera;
3. complessità temporale media e peggiore;
4. memoria aggiuntiva usata;
5. comportamento con input vuoto, duplicato, ordinato o enorme;
6. eventuali limiti di ricorsione, overflow e denial of service algoritmico.

La notazione Big O descrive come cresce il costo, non il tempo reale. Costanti, cache locality, allocazioni e I/O continuano a contare.

| Classe | Lettura pratica | Esempio |
|---|---|---|
| O(1) | costo indipendente da `n` | accesso indicizzato, lookup hash medio |
| O(log n) | dimezza lo spazio di ricerca | ricerca binaria, heap |
| O(n) | visita ogni elemento | scansione, validazione |
| O(n log n) | tipico ordinamento efficiente | merge sort, sort standard |
| O(n²) | coppie di elementi | doppio ciclo, confronto ingenuo |
| O(2ⁿ), O(n!) | esplosione combinatoria | backtracking non potato |

## Scegliere la struttura

| Necessità | Struttura iniziale | Attenzione |
|---|---|---|
| accesso per posizione | array/lista dinamica | inserimenti centrali O(n) |
| appartenenza o deduplica | set/hash set | collisioni e memoria |
| chiave → valore | hash map/dizionario | ordine non sempre garantito |
| ultimo entrato, primo uscito | stack | profondità non limitata |
| primo entrato, primo uscito | queue/deque | concorrenza e backpressure |
| minimo/massimo ripetuto | heap/priority queue | non è una lista ordinata |
| prefissi di stringhe | trie | consumo di memoria |
| relazioni e percorsi | grafo | cicli, direzione, pesi |
| componenti connesse dinamiche | union-find | compressione dei cammini |

Preferisci le collezioni della standard library. Implementale a mano una volta per capirne invarianti e costi, non per sostituire codice maturo in produzione.

## Tecniche ricorrenti

- **Two pointers:** intervalli, partizioni, sequenze ordinate.
- **Sliding window:** sottosequenze contigue con stato incrementale.
- **Ricerca binaria:** solo se il predicato è monotono; documenta estremi inclusivi/esclusivi.
- **BFS:** distanza minima in grafi non pesati e ricerca per livelli.
- **DFS:** esplorazione, componenti, cicli e backtracking; limita la profondità.
- **Greedy:** valido solo quando una scelta locale preserva l'ottimo globale.
- **Dynamic programming:** stato, transizione, casi base e ordine di calcolo.
- **Divide et impera:** separa, risolvi ricorsivamente, combina.
- **Shortest path:** BFS senza pesi, Dijkstra con pesi non negativi; altri algoritmi per vincoli diversi.

## Correttezza e sicurezza

Scrivi prima l'invariante. Esempio per ricerca binaria: “se il valore esiste, è sempre compreso nell'intervallo ancora aperto”. Poi verifica terminazione e post-condizione.

Rischi frequenti:

- hash flood, regex o parser con complessità patologica;
- allocazioni proporzionali a input non fidato;
- overflow nel calcolo di indici e dimensioni;
- ricorsione controllabile dall'utente;
- ordinamenti instabili quando l'ordine ha significato;
- confronti di segreti non constant-time.

Imponi limiti espliciti e misura con input realistici e avversariali.

## Procedura operativa
1. Implementa stack, queue, hash map semplificata, heap e grafo.
2. Risolvi lo stesso problema prima in modo ingenuo, poi ottimizzato.
3. Aggiungi test per vuoto, uno, duplicati, limite massimo e input casuali.
4. Esegui benchmark solo dopo aver definito un requisito misurabile.
5. Spiega a voce perché la struttura scelta è adatta.

## Collegamenti

- [[Manuale professionale di programmazione]]
- [[Testing e qualita del software]]
- [[Esempi di programmazione/Fondamenti confrontati|Fondamenti confrontati nei diversi linguaggi]]
