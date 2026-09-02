# Runtime AI adattivo

NEXUSNXS non associa l'identità dell'assistente a un singolo modello. Interfaccia,
memoria, strumenti, consenso e personalizzazione restano stabili; il motore può
cambiare in base alle risorse disponibili.

## Architettura prevista

```text
NEXUSNXS Desktop
  -> Hardware Profiler (grafica, HDR, densità e fluidità)
  -> NexusNXS Service HTTPS
     -> Model Router sulla workstation proprietaria
     -> Ollama confinato al server
```

Il profilo hardware considera RAM, VRAM, thread CPU e spazio libero. Il manifest
propone quindi tre ruoli indipendenti:

- `fastModel`: conversazione vocale e operazioni brevi;
- `chatModel`: ragionamento e risposte approfondite;
- `embeddingModel`: indicizzazione semantica della knowledge.

Un computer pubblico non scarica modelli. Il profilo hardware regola soltanto la
resa visiva, mentre routing e inferenza avvengono sulla workstation NexusNXS. Le workstation sviluppatore con almeno 32 GiB di RAM, 16 GiB di
VRAM e 16 thread possono ricevere automaticamente il profilo Ultra; i livelli
inferiori mantengono profili più prudenti. La selezione manuale con `Ctrl+M`
disabilita l'automatismo e assegna temporaneamente lo stesso modello ai due ruoli
conversazionali; le impostazioni avanzate permettono di separarli nuovamente.

## Identità e addestramento

La personalità di NEXUSNXS deve vivere principalmente in configurazione, prompt,
knowledge e dataset approvato, non dentro ogni copia dei pesi. In questo modo lo
stesso assistente può passare da un modello piccolo a uno più capace.

La build pubblica non crea modelli. Configurazione, adapter e fine-tuning
appartengono alla pipeline privata delle release ufficiali NexusNXS:

1. raccolta esplicita di esempi approvati;
2. pulizia e separazione train/validation;
3. addestramento LoRA/QLoRA su una GPU adatta;
4. valutazione di qualità e sicurezza;
5. conversione e importazione nel runtime;
6. pubblicazione firmata nel catalogo ufficiale di NEXUSNXS.

## Client pubblico e workstation

Le build pubbliche seguono un confine semplice:

- PC e telefono regolano soltanto interfaccia, audio e cache locale;
- l'inferenza LLM avviene sul NexusNXS Core via HTTPS e l'assenza del servizio
  viene mostrata come stato offline, senza fallback nascosti;
- la workstation dello sviluppatore può usare modelli locali più grandi, TTS e
  strumenti di valutazione, ma questi componenti non entrano negli installer;
- nessun provider esterno riceve automaticamente la knowledge privata.

Il router sceglie già in base a complessità, allegati, rischio e capacità del
computer. Le metriche locali bounded permettono di confrontare p50, p95 e p99
senza conservare il contenuto delle conversazioni. Prima di rendere adattiva una
decisione in base alla latenza, un evaluation gate deve dimostrare che la scelta
non riduce correttezza o sicurezza. Ogni eventuale passaggio fuori dal computer
deve restare visibile e configurabile dall'utente.
