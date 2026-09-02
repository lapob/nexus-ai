# Architettura

La continuità da dispositivi associati è isolata nel gateway descritto in [[REMOTE_SESSIONS]]. Il gateway non espone direttamente provider AI, database, filesystem o IPC Electron: usa adattatori applicativi limitati per leggere e continuare conversazioni persistenti.

## Runtime attuale

1. `src/main.js` abilita il sandbox e avvia il bootstrap applicativo.
2. `application/bootstrap.js` risolve vault, configurazione e servizi.
3. `infrastructure/electron/app-lifecycle.js` gestisce readiness, sessione e lifecycle.
4. `infrastructure/electron/renderer-protocol.js` serve gli asset consentiti tramite `nexus://app`.
5. `infrastructure/electron/create-main-window.js` crea e protegge la finestra.
6. `application/register-ipc.js` registra gli handler e coordina RAG, runtime AI
   e ticket del runtime azioni.
7. Il renderer isolato usa solo le operazioni esposte dal preload.
8. Settings e window state sono salvati in Electron `userData`.
9. `ai/ai-runtime.js` seleziona un provider tramite registry; Ollama è un adapter infrastrutturale sostituibile.
10. Il renderer React compone voce, stato operativo e scena GPU full-screen
    tramite componenti, sistemi e shader indipendenti. I visualizer sono
    bundle lazy separati; qualità adattiva e pausa quando la finestra non è
    visibile limitano il consumo di GPU.
11. `research/` decide quando servono dati aggiornati, interroga soltanto
    provider pubblici consentiti dal server e restituisce fonti normalizzate.

`main.js` non contiene più costruzione della finestra, handler IPC, retrieval o
gestione del lifecycle. Rimane intenzionalmente il composition entry point che
deve eseguire `app.enableSandbox()` prima di `app.whenReady()`.

## Presenza di sistema

Il client Windows separa tre processi con responsabilità non sovrapposte:

1. **Core** (`--background` nel client pubblico oppure `--server` sulla
   workstation) mantiene continuità, gateway e servizi senza mostrare finestre.
2. **Presence** (`--presence`) disegna un nucleo CSS-only leggero su ogni
   display, segue hot-plug, DPI e coordinate negative e non carica AI,
   database, RAG o renderer WebGL.
3. **UI** (`--ui`) apre l'esperienza completa su richiesta. La sua chiusura non
   interrompe Core; Presence torna visibile appena la UI è realmente chiusa.

Core e Presence comunicano solo tramite named pipe locale autenticata. Il
contratto remoto accetta azioni semantiche per Presence, UI e un catalogo
applicativo Windows statico. `open-application` richiede un identificatore in
allowlist e non accetta eseguibili, argomenti o percorsi dal telefono; stato e
disponibilità sono metadata-only. Non vengono esposti shell, processi grezzi,
nomi monitor, geometrie, handle nativi o percorsi della workstation. Ogni mutazione remota segue
plan → consenso esplicito → esecuzione → postcondizione → ricevuta metadata-only.

I task Windows di Core e Presence partono separatamente al login, senza console
visibili e con istanze duplicate disabilitate. `npm run qa:presence` verifica
la collocazione reale su tutti i monitor connessi senza usare il profilo dati
dell'utente.

## Confini target

| Directory | Responsabilità |
|---|---|
| `core` | entità, configurazione, errori e policy indipendenti |
| `application` | casi d'uso e contratti di ingresso/uscita |
| `infrastructure` | filesystem, persistence, Electron e provider esterni |
| `services` | servizi condivisi e osservabilità |
| `knowledge/rag.js` | ingestione, indice e retrieval della vault Markdown |
| `agents` | catalogo strumenti, validazione, ticket, esecuzione e audit locale |
| `research` | policy temporale, ricerca web server-side, budget e citazioni pubbliche |
| `renderer` | shell React ambientale, controller voce e visualizer WebGL |

Il codice esistente non viene spostato finché il nuovo confine non dispone di
test equivalenti. Il runtime azioni è isolato in `agents/action-runtime.js` e
riceve shell, consenso e logger tramite dependency injection.

## Navigazione del sorgente

Ogni sorgente dichiara `@module` e `@description`. I file lunghi sono divisi in
regioni numerate comprimibili dall'IDE. La mappa completa è in `CODE_MAP.md`; le
regole sono in `COMMENTING_STANDARD.md` e vengono verificate da
`npm run check:sections`.

## Processo principale Electron

```text
main.js
  -> application/bootstrap.js
     -> infrastructure/electron/app-lifecycle.js
     -> infrastructure/electron/renderer-protocol.js
     -> infrastructure/electron/create-main-window.js
     -> application/register-ipc.js
     -> NexusIndex + config + logger
```

La policy RAG e Quick/Deep resta applicativa; HTTP, NDJSON, health, modelli ed
embedding sono confinati nel provider. La ricerca web è un servizio separato:
non può eseguire azioni e le sue fonti sono sempre dati non fidati. Il renderer
vede soltanto capability IPC, stati sintetici e citazioni pubbliche prive di
percorsi locali.

## Configurazione

Ordine di risoluzione:

1. impostazioni salvate dall'utente per endpoint, modello e temperatura;
2. variabili `NEXUS_LLM_*` come default runtime;
3. default sicuri definiti in `src/core/config.js`.

La vault usa `NEXUS_VAULT_PATH`, `config/portable.json` o la directory padre.
Gli endpoint Internet vengono sempre rifiutati. La LAN privata è consentita
solo con opt-in esplicito e IP RFC1918 validato prima di ogni inizializzazione.

La separazione fra fonti, modelli, indici, artefatti, cache e segreti e i limiti
dei servizi Windows su disco rimovibile sono documentati in
[`PORTABLE_STORAGE.md`](PORTABLE_STORAGE.md).

## Contratti IPC

I nomi dei canali e la validazione dei payload privilegiati sono definiti in
`src/application/ipc-contracts.js`. Il preload espone una API minima; il main
resta l'autorità di validazione.
