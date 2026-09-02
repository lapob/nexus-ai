---
title: Addestramento e valutazione dei modelli AI
type: guide
area: cultura-generale
status: evergreen
level: intermediate
visibility: public
created: 2026-09-02
updated: 2026-09-02
source_kind: research-primary
tags: [ai, addestramento, benchmark, valutazione, multimodale, sicurezza]
aliases: [Training dei modelli AI, Benchmark dei modelli generativi]
---

# Addestramento e valutazione dei modelli AI

## Un modello più grande non è automaticamente migliore

La qualità finale dipende dall'equilibrio fra architettura, quantità e qualità dei dati, calcolo disponibile, procedura di allineamento e valutazione. Le leggi di scaling aiutano a distribuire il budget fra parametri e token; non sostituiscono deduplicazione, provenienza, copertura linguistica e controllo degli errori.

Un sistema utile comprende inoltre retrieval, strumenti, memoria controllata, filtri di sicurezza e un runtime efficiente. Migliorare questi componenti può dare risultati quotidiani superiori a un aumento indiscriminato dei parametri.

## Ciclo industriale essenziale

1. **Definizione del prodotto:** compiti, lingue, limiti, rischi e metriche osservabili.
2. **Curazione dei dati:** licenza, provenienza, deduplicazione, qualità, bilanciamento e rimozione dei dati sensibili.
3. **Pre-training o scelta della base:** apprendimento generale su grandi corpus oppure selezione di un modello base già addestrato.
4. **Supervised fine-tuning:** esempi revisionati insegnano formato, stile e comportamento desiderato.
5. **Ottimizzazione delle preferenze:** confronti fra risposte scelte e scartate affinano utilità e prudenza; DPO è una tecnica più semplice dell'intero ciclo RLHF classico, ma richiede comunque preferenze affidabili.
6. **Valutazione separata:** benchmark non usati nel training, prove avversarie, valutazione umana e test sul prodotto reale.
7. **Distribuzione graduale:** canary, metriche di qualità e latenza, rollback e monitoraggio degli incidenti.
8. **Nuovo ciclo:** gli errori osservati diventano casi di test; soltanto esempi autorizzati e revisionati possono diventare dati di training.

## Perché servono più famiglie di benchmark

Un unico punteggio nasconde compromessi. Una matrice utile separa almeno:

| Traccia | Domanda misurata | Esempi di metriche |
|---|---|---|
| ragionamento | conserva vincoli e risolve problemi nuovi? | accuratezza, robustezza alle parafrasi |
| codice | produce output e correzioni verificabili? | test superati, regressioni, sicurezza |
| retrieval | usa il documento giusto senza inventare? | Hit@K, MRR, precisione delle citazioni |
| ricerca web | seleziona fonti pertinenti e aggiornate? | supporto delle affermazioni, data, pertinenza |
| multimodale | collega davvero immagine, audio e video alla risposta? | grounding, allucinazioni, comprensione temporale |
| voce | riconosce e sintetizza in ambienti reali? | WER, latenza, falsi richiami, valutazione d'ascolto |
| sicurezza | resiste a injection ed esfiltrazione? | tasso di violazione e falsi positivi |
| sistema | resta veloce e disponibile sotto carico? | first-token, p50/p95, memoria, error rate |

HELM propone valutazioni trasparenti su scenari e metriche diverse; MLPerf definisce regole riproducibili per le prestazioni di inferenza. Per il video, benchmark come Video-MME combinano durata, domini, fotogrammi, audio e sottotitoli: allenarsi solo su descrizioni testuali non dimostra comprensione video.

## Separare training, validation e test

Gli esempi della stessa domanda e le relative parafrasi devono restare nello stesso split. I prompt dei benchmark non vanno inseriti nel training: la contaminazione può gonfiare il punteggio senza migliorare la capacità reale. Sono utili anche set canary nuovi, usati una sola volta per la decisione di promozione.

Una pipeline robusta conserva:

- identificatore e checksum del dataset;
- licenza e provenienza di ogni esempio;
- trasformazioni applicate;
- split deterministici e isolati;
- baseline e candidato valutati con lo stesso protocollo;
- report di regressione e piano di rollback.

## Immagini, audio e video

I file multimediali devono restare asset separati dal testo, con checksum, licenza, didascalia e annotazioni. Per un video servono campionamento temporale, trascrizione, eventi ordinati e domande che richiedano di collegare istanti diversi. Una preferenza multimodale deve dipendere davvero dall'immagine o dal video: se la risposta può essere scelta ignorando il contenuto visivo, il dataset non misura grounding.

Prima del training conviene costruire un benchmark multimodale piccolo ma accurato, con esempi originali o redistribuibili, risposte revisionate e casi negativi. Il dataset può crescere soltanto dopo che acquisizione, privacy e diritti sono chiari.

## Feedback degli utenti senza avvelenare il modello

Il feedback pubblico non deve aggiornare direttamente i pesi. Un flusso prudente è:

1. consenso esplicito e minimizzazione dei dati;
2. quarantena separata dalla knowledge e dal training;
3. rimozione di segreti, dati personali e contenuti non autorizzati;
4. deduplicazione e controllo della provenienza;
5. revisione umana della risposta scelta e di quella scartata;
6. inserimento nel dataset approvato;
7. confronto del candidato con baseline, benchmark intoccati e canary freschi;
8. promozione manuale e reversibile.

Il feedback è più utile quando segnala un errore concreto e contiene una correzione verificabile. Il volume da solo non garantisce qualità e può amplificare bias, spam o attacchi coordinati.

## Criterio di promozione

Un candidato è migliore soltanto se supera le soglie obbligatorie senza regressioni importanti in sicurezza, affidabilità, lingue, latenza e memoria. Il risultato deve essere ripetibile sulla macchina di produzione. Se il dataset è ancora piccolo o sbilanciato, è preferibile migliorare retrieval, prompt, strumenti ed eval invece di effettuare un fine-tuning prematuro.

## Collegamenti

- [[Alfabetizzazione AI uso responsabile verifica e privacy]]
- [[Pensiero critico fonti statistiche e disinformazione]]
- [[Statistica probabilita rischio e decisione]]
- [[../01_Informatica/AI/Fondamenti di AI applicata|Fondamenti di AI applicata]]

## Fonti

- Hoffmann et al., *Training Compute-Optimal Large Language Models*: https://arxiv.org/abs/2203.15556 (consultato 2026-09-02).
- Ouyang et al., *Training language models to follow instructions with human feedback*: https://arxiv.org/abs/2203.02155 (consultato 2026-09-02).
- Rafailov et al., *Direct Preference Optimization*: https://arxiv.org/abs/2305.18290 (consultato 2026-09-02).
- Stanford CRFM, *Holistic Evaluation of Language Models*: https://crfm.stanford.edu/helm/ (consultato 2026-09-02).
- MLCommons, *MLPerf Inference*: https://mlcommons.org/working-groups/benchmarks/inference/ (consultato 2026-09-02).
- Fu et al., *Video-MME*: https://arxiv.org/abs/2405.21075 (consultato 2026-09-02).
- NIST, *AI Risk Management Framework*: https://www.nist.gov/itl/ai-risk-management-framework (consultato 2026-09-02).
- Sainz et al., *NLP Evaluation in trouble*: https://arxiv.org/abs/2310.18018 (consultato 2026-09-02).
