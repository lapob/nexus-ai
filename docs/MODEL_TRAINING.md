# Pipeline privata dei modelli NexusNXS

La build pubblica non crea modelli. Gli utenti installano e selezionano soltanto
artefatti approvati nel catalogo NexusNXS. Creazione, adapter, fine-tuning,
valutazione e pubblicazione appartengono alla pipeline dello sviluppatore.

## Identità prodotto

| Nome prodotto | Ruolo | Runtime di sviluppo |
| --- | --- | --- |
| NexusNXS Nano | compatibilità minima | Qwen3 1.7B |
| NexusNXS Pulse | conversazione leggera | Qwen3 4B |
| NexusNXS Core | modello bilanciato | Qwen3 8B |
| NexusNXS Prime | qualità massima locale | Qwen3 14B |
| NexusNXS Ultra | qualità workstation, MoE | Qwen3 30B-A3B |
| NexusNXS Memory | retrieval locale | Qwen3 Embedding 0.6B |

Il nome NexusNXS identifica configurazione, dataset autorizzato, valutazioni,
adapter e packaging del prodotto. Non altera la licenza o la provenienza dei
pesi base, che devono restare documentate nelle attribution della release.

## Confine pubblico

- nessun pulsante per creare modelli;
- nessun canale IPC `createModel`;
- nessuna API esposta nel preload;
- nessun accesso dell'utente a Modelfile o pipeline di training;
- memoria personale separata dai pesi e cancellabile;
- selezione limitata ai modelli installati e compatibili.

## Pipeline dello sviluppatore

1. definire requisiti e benchmark;
2. acquisire soltanto dati con provenienza e licenza compatibili;
3. rimuovere segreti, dati personali e duplicati;
4. separare training, validation e test prima di addestrare;
5. creare una baseline riproducibile;
6. eseguire LoRA/QLoRA su infrastruttura isolata;
7. valutare qualità, sicurezza, regressioni e prestazioni hardware;
8. documentare modello base, commit dati, parametri e metriche;
9. esportare un artefatto immutabile e firmato;
10. pubblicare nel catalogo NexusNXS solo dopo approvazione.

## Dataset

Ogni record deve avere identificatore, provenienza, licenza, data di
acquisizione, hash, lingua, dominio, trasformazioni e split. Le correzioni
approvate nell'app sono materiale candidato, non entrano automaticamente nel
training.

Sono esclusi:

- credenziali, token, dump e log non sanitizzati;
- note personali o aziendali senza consenso esplicito;
- contenuti ottenuti aggirando paywall o condizioni d'uso;
- materiale senza provenienza o con licenza incompatibile;
- output sintetico non verificato usato ricorsivamente come verità.

## Gate di rilascio

- benchmark generale e suite NexusNXS superati;
- hallucination, refusal e prompt-injection test documentati;
- regressioni rispetto alla versione precedente entro soglia;
- latenza, RAM, VRAM e dimensione misurate sui cinque profili hardware;
- attribution, licenze, model card e checksum inclusi;
- rollback disponibile.

## Laboratorio locale

`npm run ai:evaluate -- --deep qwen3:8b qwen3:14b qwen3:30b` esegue la stessa suite
locale su lingua italiana, istruzioni strutturate, logica, prudenza e gestione
dell'ambiguità. NexusNXS Ultra è compatibile soltanto con hardware 5/5 (almeno
30 GiB RAM e 14 GiB VRAM); Prime e Core restano fallback immediati. Questa
valutazione confronta modelli base. Un modello “personale addestrato” può essere
rilasciato solo dopo un dataset di correzioni approvate, split indipendenti e
un fine-tuning LoRA/QLoRA riproducibile.

`npm run ai:dataset` prepara esclusivamente gli esempi approvati in tre split
deterministici (`train`, `validation`, `test`) e produce un manifest. Il comando
non modifica i pesi e mantiene il gate chiuso finché non esistono almeno 200
esempi diversi, con validation e test sufficienti. Questo evita di chiamare
“addestramento” la semplice memorizzazione di poche conversazioni e impedisce
che la valutazione venga contaminata dai dati di training.

Al termine, `ai:dataset:validate` verifica nuovamente schema, provenienza,
segreti, duplicati fra split, conteggi e hash SHA-256. Il relativo
`validation-report.json` è la ricevuta riproducibile da conservare con model
card e parametri LoRA. Un report non pronto mantiene chiuso il gate: non è un
errore dell'app e non autorizza la promozione di un modello.

Le correzioni producono inoltre split `preference-train`,
`preference-validation` e `preference-test` compatibili con una pipeline DPO.
Gli esempi con lo stesso prompt restano sempre nello stesso split, anche quando
esistono più risposte, per impedire contaminazioni. `integrity-receipt.json`
lega dataset e file tramite SHA-256; è una ricevuta di contenuto e non sostituisce
la firma di identità applicata agli artefatti di release.

Il ciclo operativo completo e le soglie di promozione sono descritti in
[`DATA_FLYWHEEL.md`](DATA_FLYWHEEL.md).
