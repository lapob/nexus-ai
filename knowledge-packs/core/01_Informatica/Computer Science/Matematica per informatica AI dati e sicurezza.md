---
title: Matematica per informatica, AI, dati e sicurezza
type: manuale
area: computer-science
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [matematica, computer-science, ai, data, cybersecurity]
aliases: [Matematica per informatica]
---

# Matematica per informatica, AI, dati e sicurezza

## Sintesi

Questa nota è una mappa di studio: ogni formula deve diventare prima intuizione, poi calcolo manuale, infine codice e verifica.

## Fondamenti indispensabili

- **Aritmetica e algebra:** frazioni, potenze, logaritmi, equazioni, sistemi e notazione scientifica.
- **Logica:** proposizioni, equivalenza, implicazione, quantificatori e dimostrazioni.
- **Insiemi e relazioni:** unione, intersezione, prodotto cartesiano, funzioni e cardinalità.
- **Combinatoria:** permutazioni, combinazioni, principio dei cassetti e conteggio.
- **Grafi:** cammini, cicli, alberi, connettività e flussi.

## Probabilità e statistica

Una probabilità descrive l’incertezza di un modello; una frequenza descrive dati osservati. Studiare:

1. eventi, probabilità condizionata e teorema di Bayes;
2. variabili casuali e distribuzioni comuni;
3. media, mediana, varianza, quantili e correlazione;
4. campionamento, intervalli di confidenza e test d’ipotesi;
5. falsi positivi, falsi negativi, precision, recall e calibrazione.

In sicurezza, un alert con accuratezza elevata può produrre molti falsi positivi se l’evento malevolo è raro. Considerare sempre il *base rate*.

## Algebra lineare

Vettori e matrici sono il linguaggio di grafica, segnali, embedding e machine learning. Padroneggiare prodotto scalare, norme, distanza coseno, trasformazioni lineari, autovalori e decomposizione SVD. Verificare dimensioni e condizionamento numerico prima di fidarsi del risultato.

## Calcolo e ottimizzazione

Derivate e gradienti spiegano come cambia una funzione; integrali e somme descrivono accumulo; l’ottimizzazione cerca parametri che minimizzano una perdita. Distinguere minimo locale, minimo globale, overfitting e regolarizzazione.

## Scenario tecnico progressivo
- implementare media, varianza e regressione senza librerie;
- simulare il teorema di Bayes con dati sintetici;
- rappresentare una rete come grafo ed eseguire BFS e Dijkstra;
- calcolare similarità coseno tra documenti;
- confrontare metriche di un classificatore sbilanciato.

## Collegamenti

- [[Matematica discreta logica e calcolabilita]]
- [[Algoritmi e strutture dati]]
- [[Machine learning fondamenti e workflow]]
- [[Crittografia applicata per tecnici]]
- [[RAG embeddings memoria e knowledge graph]]
