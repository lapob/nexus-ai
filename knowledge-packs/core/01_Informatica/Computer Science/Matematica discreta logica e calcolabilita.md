---
title: Matematica discreta, logica e calcolabilità
type: foundation
area: computer-science
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [math, logic, graphs, complexity]
aliases: []
---

# Matematica discreta, logica e calcolabilità

## Strumenti

- logica proposizionale: `¬`, `∧`, `∨`, `→`, equivalenze e tavole di verità;
- predicati: quantificatori universale ed esistenziale;
- insiemi, relazioni, funzioni e cardinalità;
- induzione per dimostrare proprietà ricorsive;
- combinatoria e probabilità per contare e stimare rischio;
- grafi per reti, dipendenze, percorsi e scheduling.

Un grafo può essere diretto, pesato, ciclico o bipartito. BFS trova cammini
minimi non pesati; DFS esplora struttura e cicli; Dijkstra richiede pesi non
negativi; topological sort richiede un DAG.

## Complessità

Big-O limita crescita asintotica; Ω è limite inferiore, Θ limite stretto.
Analizzare tempo e spazio, caso medio e peggiore. Costanti e cache contano sui
dati reali. P indica problemi risolvibili in tempo polinomiale; NP quelli con
soluzioni verificabili in tempo polinomiale. NP-hard non significa
automaticamente impossibile nella pratica.

## Correttezza

Precondizione, postcondizione e invarianti rendono esplicito il contratto.
Property-based testing genera casi; formal methods dimostrano proprietà entro
un modello. Il modello deve comunque corrispondere al sistema reale.
