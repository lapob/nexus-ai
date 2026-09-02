---
title: Dataset, training e post-training dei modelli generativi
type: technical-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-08-15
updated: 2026-08-15
source_kind: curated-synthesis
tags: [dataset, training, post-training, fine-tuning, evaluation, reproducibility]
aliases: [Addestramento dei modelli generativi, Dataset e post-training]
---

# Dataset, training e post-training dei modelli generativi

## Obiettivo

Migliorare un modello non significa semplicemente aggiungere documenti o aumentare le epoche. Il lavoro professionale separa quattro problemi:

1. **conoscenza aggiornata**, normalmente risolta con retrieval e fonti verificabili;
2. **comportamento**, migliorato con istruzioni, esempi supervisionati e preferenze;
3. **capacità**, che dipende soprattutto dal modello base, dai dati e dal calcolo disponibile;
4. **affidabilità**, costruita con valutazioni, osservabilità, controlli e regressioni.

Il criterio decisivo è la prestazione su un insieme di test mai usato per addestrare o scegliere gli esempi.

## Anatomia del ciclo

```text
obiettivo -> tassonomia dei compiti -> raccolta -> licenze e provenienza
          -> pulizia -> deduplicazione -> split per gruppi e tempo
          -> baseline -> training -> valutazione cieca -> analisi errori
          -> rilascio controllato -> monitoraggio -> nuova iterazione
```

Ogni esecuzione deve produrre un *model card* e un registro con modello base, tokenizer, versione del codice, ambiente, seed, dataset, split, iperparametri, checkpoint, metriche e limiti noti.

## Progettare il dataset

### Unità e schema

Definire prima lo schema, non dopo la raccolta. Per un assistente può contenere:

- richiesta e contesto minimo necessario;
- risposta attesa o coppia di preferenza;
- lingua, dominio, difficoltà e tipo di ragionamento;
- strumenti ammessi e risultato verificato;
- provenienza, licenza, data e livello di fiducia;
- annotazioni su sicurezza, privacy e possibili ambiguità.

Un esempio lungo non è automaticamente migliore. Deve insegnare una decisione precisa e non contenere dettagli accidentali che il modello potrebbe imitare.

### Qualità prima della quantità

- normalizzare encoding, Unicode e spazi senza distruggere codice o dati strutturati;
- eliminare duplicati esatti e quasi duplicati prima dello split;
- separare template molto simili per evitare contaminazione tra train e test;
- rimuovere segreti, dati personali non necessari e materiale senza diritto d'uso;
- mantenere casi negativi, richieste ambigue, errori realistici e rifiuti corretti;
- bilanciare lingue e domini secondo l'uso reale, non secondo la disponibilità casuale.

La provenienza è parte del dato. Se non si sa da dove arriva un esempio, non è possibile valutarne licenza, freschezza o attendibilità.

## Split senza contaminazione

Lo split casuale per riga spesso sovrastima la qualità. Preferire:

- **group split** per documento, autore, repository o famiglia di problema;
- **time split** quando si misura generalizzazione a informazioni future;
- **challenge set** scritto indipendentemente dal team che prepara il training;
- **canary set** riservato alle regressioni più importanti;
- **adversarial set** per prompt injection, ambiguità, dati corrotti e tool failure.

Conservare gli hash degli esempi di test e controllare somiglianza semantica e lessicale rispetto al training.

## Scegliere la tecnica giusta

| Esigenza | Prima scelta | Motivo |
|---|---|---|
| fatti aggiornabili e fonti | RAG | modifica il contesto, non i pesi |
| tono e formato coerenti | prompt + SFT mirato | comportamento osservabile |
| preferire risposte migliori | preference optimization | apprende confronti |
| specializzazione economica | LoRA/PEFT | pochi parametri addestrabili |
| modello più piccolo | distillazione | trasferisce capacità misurate |
| nuova capacità ampia | nuovo pretraining o base migliore | richiede dati e calcolo sostanziali |

LoRA non rende automaticamente migliore un modello: riduce il costo dell'adattamento. Un adapter addestrato su dati rumorosi può peggiorare generalizzazione, lingua e sicurezza.

## Training controllato

### Baseline

Prima di addestrare, salvare i risultati del modello base sugli stessi test. Senza baseline non è possibile distinguere un miglioramento reale da una variazione casuale.

### Segnali da osservare

- loss di train e validation;
- accuracy o pass rate per categoria;
- calibrazione e tasso di astensione corretto;
- regressioni per lingua, lunghezza e difficoltà;
- allucinazioni, citazioni errate e uso improprio degli strumenti;
- latenza, memoria, throughput e costo energetico;
- stabilità tra seed e checkpoint.

Training loss più bassa non equivale a prodotto migliore. Interrompere o rivedere il dataset se la validation peggiora, le risposte diventano stereotipate o le capacità generali regrediscono.

### Riproducibilità

Fissare seed e versioni riduce la variabilità, ma non garantisce risultati identici tra release, piattaforme, CPU e GPU. Per gli esperimenti importanti:

- congelare ambiente e dipendenze;
- registrare driver, runtime e precisione numerica;
- usare algoritmi deterministici quando il costo è accettabile;
- ripetere più seed e riportare distribuzione, non soltanto il risultato migliore;
- distinguere benchmark di ricerca, dove serve controllo, da serving, dove conta anche la prestazione.

## Post-training di un assistente

### Supervised fine-tuning

Gli esempi devono mostrare il comportamento finale desiderato: chiarire quando serve, agire entro i permessi, verificare il risultato e dichiarare limiti reali. Separare esempi di conversazione, coding, tool use e sicurezza per misurare gli effetti di ciascun gruppo.

### Preferenze

Le coppie devono differire per un motivo annotabile: correttezza, utilità, rispetto delle istruzioni, concisione, sicurezza o qualità delle evidenze. Preferenze incoerenti insegnano soltanto rumore. Calcolare l'accordo tra annotatori e revisionare le categorie con disaccordo elevato.

### Tool use

Valutare l'intera traiettoria, non solo il testo finale:

1. scelta dello strumento;
2. argomenti validi e minimo privilegio;
3. interpretazione dell'output;
4. gestione di timeout ed errori;
5. verifica dello stato finale;
6. richiesta di consenso prima di azioni sensibili.

Una risposta elegante dopo un comando fallito non è un successo.

## Valutazione multilivello

### Offline

Costruire una matrice `capacità × lingua × difficoltà × rischio`. Ogni metrica aggregata deve poter essere esplosa per categoria; la media può nascondere una regressione grave.

### Pairwise e rubriche

Il confronto tra due risposte è spesso più stabile di un voto assoluto, ma ordine, lunghezza e stile introducono bias. Randomizzare la posizione, usare rubriche ancorate a esempi e verificare con valutatori umani i casi ad alto impatto.

### Online

Raccogliere solo telemetria necessaria e con consenso. Distinguere:

- feedback esplicito;
- correzione dell'utente;
- abbandono o rigenerazione;
- esito verificabile del compito;
- incidente di sicurezza o privacy.

Il feedback reale entra prima in una coda di revisione: non deve aggiornare automaticamente i pesi del modello in produzione.

## Diagnosi degli errori

Per ogni fallimento classificare almeno:

- **retrieval**: fonte assente, ranking errato o contesto insufficiente;
- **comprensione**: intento, lingua o vincolo non riconosciuto;
- **ragionamento**: passaggio logico o calcolo errato;
- **generazione**: risposta troncata, ripetitiva o nel formato sbagliato;
- **tooling**: comando, permesso, parsing o verifica falliti;
- **policy**: rifiuto eccessivo oppure azione troppo permissiva;
- **sistema**: timeout, memoria, concorrenza o perdita dello stato.

Correggere il livello giusto evita fine-tuning inutili. Un problema di speech recognition, retrieval o orchestrazione non si risolve addestrando alla cieca il modello linguistico.

## Gate prima del rilascio

- nessuna regressione critica rispetto alla baseline;
- test ciechi separati dal dataset di sviluppo;
- provenienza e licenze complete;
- privacy review e scansione dei segreti;
- test multilingue e accessibilità;
- red team proporzionato alle capacità;
- rollback del modello e degli adapter provato;
- canary deployment con soglie di arresto;
- model card, limiti e data di valutazione pubblicati.

## Fonti primarie

- [PyTorch — Reproducibility](https://docs.pytorch.org/docs/stable/notes/randomness)
- [Hugging Face PEFT — LoRA developer guide](https://github.com/huggingface/peft/blob/main/docs/source/developer_guides/lora.md)
- [NIST — AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST AI 600-1 — Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)

## Collegamenti

- [[LLM tokenizzazione inference e fine tuning]]
- [[Evaluation safety e red teaming per AI]]
- [[MLOps versionamento deployment e monitoraggio]]
- [[RAG embeddings memoria e knowledge graph]]
- [[Agenti tool use pianificazione e consenso]]
