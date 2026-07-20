# Architettura

## Runtime attuale

1. `src/main.js` abilita il sandbox e avvia il bootstrap applicativo.
2. `application/bootstrap.js` risolve vault, configurazione e servizi.
3. `infrastructure/electron/app-lifecycle.js` gestisce readiness, sessione e lifecycle.
4. `infrastructure/electron/create-main-window.js` crea e protegge la finestra.
5. `application/register-ipc.js` registra gli handler e coordina RAG e modello locale.
6. Il renderer isolato usa solo le operazioni esposte dal preload.
7. Settings e window state sono salvati in Electron `userData`.

`main.js` non contiene più costruzione della finestra, handler IPC, retrieval o
gestione del lifecycle. Rimane intenzionalmente il composition entry point che
deve eseguire `app.enableSandbox()` prima di `app.whenReady()`.

## Confini target

| Directory | Responsabilità |
|---|---|
| `core` | entità, configurazione, errori e policy indipendenti |
| `application` | casi d'uso e contratti di ingresso/uscita |
| `infrastructure` | filesystem, persistence, Electron e provider esterni |
| `services` | servizi condivisi e osservabilità |
| `knowledge` | ingestione, indice, retrieval e graph model |
| `agents` | futuro runtime agentico; vuoto nella Foundation Phase |
| `models` | DTO e modelli dati condivisi |

Il codice esistente non viene spostato finché il nuovo confine non dispone di
test equivalenti. Questa strategia evita un refactoring big-bang.

## Processo principale Electron

```text
main.js
  -> application/bootstrap.js
     -> infrastructure/electron/app-lifecycle.js
     -> infrastructure/electron/create-main-window.js
     -> application/register-ipc.js
     -> NexusIndex + config + logger
```

La separazione è strutturale: nomi dei canali, preload, CSP, hardening della
finestra, flusso RAG e protocollo del modello locale restano invariati.

## Configurazione

Ordine di risoluzione:

1. impostazioni salvate dall'utente per endpoint, modello e temperatura;
2. variabili `NEXUS_LLM_*` come default runtime;
3. default sicuri definiti in `src/core/config.js`.

La vault usa `NEXUS_VAULT_PATH`, `config/portable.json` o la directory padre.
Gli endpoint non locali vengono sempre rifiutati.

## Contratti IPC

I nomi dei canali e la validazione dei payload privilegiati sono definiti in
`src/application/ipc-contracts.js`. Il preload espone una API minima; il main
resta l'autorità di validazione.
