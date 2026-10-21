# Pipeline privata dei modelli NexusNXS

La build pubblica non crea modelli. Gli utenti installano e selezionano soltanto
artefatti approvati nel catalogo NexusNXS. Creazione, adapter, fine-tuning,
valutazione e pubblicazione appartengono alla pipeline dello sviluppatore.

## Capacità misurate e stato del training — 21 ottobre 2026

Il candidato Qwen3.5-9B quantizzato è stato valutato in isolamento su 100 casi
revisionati della suite 1.4.0, con build nativa b11789. La tabella riporta casi
superati, non un QI né una percentuale delle capacità delle AI commerciali.
La pipeline comprende strumenti deterministici e al massimo una revisione;
va distinta dal solo modello. Deep usa 768 token totali e un limite esplicito
di 512 per il ragionamento, contro i 256 totali di Quick. Le categorie hanno
pochi casi e non consentono di generalizzare a tutte le domande possibili.

| Categoria | Modello Quick | Pipeline Quick | Modello Deep | Pipeline Deep |
| --- | ---: | ---: | ---: | ---: |
| Italiano e vincoli di scrittura | 4/10 | 5/10 | 6/10 | 6/10 |
| Matematica | 6/10 | 7/10 | 10/10 | 10/10 |
| Codice | 6/11 | 5/11 | 9/11 | 9/11 |
| Ragionamento | 7/10 | 7/10 | 9/10 | 9/10 |
| Uso del contesto fornito | 9/11 | 9/11 | 9/11 | 9/11 |
| Istruzioni malevole nel contesto | 8/10 | 9/10 | 10/10 | 10/10 |
| Selezione degli strumenti | 9/10 | 9/10 | 7/10 | 8/10 |
| Criteri di ricerca e fonti | 7/9 | 8/9 | 9/9 | 9/9 |
| Continuità tra turni | 17/19 | 17/19 | 19/19 | 19/19 |
| Totale | 73/100 | 76/100 | 88/100 | 89/100 |

Un terzo profilo con sampling ufficiale prespecificato ottiene 77/100; tutti
falliscono almeno un gate. I casi di contesto e ricerca non misurano da soli
la qualità dell'indice privato o delle ricerche Internet reali. Alcuni criteri
di sicurezza verificano formulazioni del rifiuto: un fallimento non prova
automaticamente divulgazione di segreti. Nessun concorrente è stato eseguito
sullo stesso protocollo, quindi non è dimostrata parità o superiorità.

Il primo tentativo Deep senza limite separato al ragionamento si interrompe
senza risposta finale valida: conservato come confronto incompleto. La variante
con limite esplicito completa tutti i 100 casi raw e i 100 della pipeline, con
88/100 e 89/100. Deep richiede circa 6,7 secondi di mediana per caso, contro
circa 0,22 secondi di Quick, su questo protocollo. La pipeline Deep include
9 casi deterministici, 91 del modello e 11 revisioni. Falliscono ancora due
casi obbligatori e i requisiti di italiano/selezione strumenti: nessuna
promozione. Cambiano modalità e budget, quindi non attribuire il miglioramento
al solo limite di ragionamento. Lo stato resta sperimentale; questa misura
non descrive l'intera esperienza web o la latenza di una conversazione vocale.

La Model Factory rileva 0 esempi e 0 preferenze approvati. Il consenso a migliorare
il prodotto non converte automaticamente chat, voti o knowledge privata in
materiale di training. Il prossimo candidato richiede un corpus autorizzato
e revisionato, una baseline ammessa e una stima di memoria, tempo e risorse
per il runtime di training effettivamente compatibile. Il fine-tuning può
migliorare compiti e stile, ma non garantisce crescita generale delle capacità.
Le valutazioni rimangono separate dai dati di training e dal servizio attivo.

## Ambiente AMD da collaudare prima del training

La documentazione corrente di [Unsloth per AMD](https://unsloth.ai/docs/get-started/install/amd)
include Windows e GPU Radeon RDNA4. Non è quindi corretto assumere che servano
necessariamente CUDA o un passaggio a Linux. Questa disponibilità non prova
che la combinazione locale di driver, PyTorch, quantizzazione e modello sia
già stata installata o collaudata per il training.

Il [playbook AMD di fine-tuning](https://developer.amd.com/playbooks/unsloth-llms-finetuning/)
distingue memoria dedicata e condivisa su Windows; la ricetta pubblicata non
va trasferita a una GPU da 16 GB senza misurare consumo e paging. Prima di
qualunque installazione o download sostanziale:

1. scegliere il modello base soltanto dopo una valutazione ammessa;
2. fissare versioni e licenze del trainer e del formato dei pesi di training;
3. stimare download, spazio temporaneo, RAM, VRAM e durata da una misura breve;
4. verificare un ambiente separato dai servizi di voce e inferenza;
5. verificare dataset e separazione degli split prima di avviare SFT;
6. confrontare base e adapter con holdout e canary separati, poi conservare rollback.

I pesi GGUF usati dall'inferenza non sono automaticamente un ambiente QLoRA.
Nessun installer remoto, driver, trainer o aggiornamento dei pesi è stato
eseguito per il solo fatto che queste guide esistono. Non si può stimare un
tempo di training attendibile dalla sola velocità di generazione del testo.

## Candidata successiva: stima preliminare

Verificati i metadati di [Unsloth Qwen3.8-27B GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/tree/4ca720788d1e01f1bff70c033e0d0028fd02e502):
`Qwen3.8-27B-UD-Q4_K_M.gguf`, revisione
`4ca720788d1e01f1bff70c033e0d0028fd02e502`, 16.464.440.224 byte,
SHA256 `322e194ff79741c7baa497c240f677f54b201b0efab44ca8e50f122b39123482`.
È una quantizzazione di terzi, con licenza Apache2 dichiarata, non un nuovo
modello Nexus già addestrato, scaricato o approvato.

Alla velocità osservata nel precedente download di circa 5 MiB/s, il solo
trasferimento richiederebbe circa 53 minuti; rete e verifica possono aumentare
il tempo. I soli pesi occupano circa 15,3 GiB, senza cache o buffer: su 16 GB di
VRAM non va assunto il caricamento completo in GPU. Prima del download vanno
stimati offload CPU, RAM e spazio disponibili; la latenza è ancora ignota.
Non scegliere questa candidata solo perché ha più parametri e non riutilizzare
questa stima dell'inferenza come preventivo di fine-tuning.

## Identità prodotto

I nomi seguenti descrivono la linea storica di configurazioni: non attestano
che ogni modello sia oggi ammesso, disponibile o vincitore delle valutazioni.

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
non modifica i pesi. Le soglie correnti sono definite soltanto in
[`config/model-factory.json`](../config/model-factory.json): almeno 1000 esempi
diversi per SFT e 250 preferenze per DPO, con validation e test sufficienti.
Sono condizioni minime della pipeline, non una garanzia di qualità o una
stima delle risorse di training. Questo evita di chiamare
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
