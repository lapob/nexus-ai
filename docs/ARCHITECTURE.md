# Architettura

## Runtime attuale

1. Electron main risolve la vault e costruisce `NexusIndex`.
2. Il renderer isolato usa solo le operazioni esposte dal preload.
3. Gli handler IPC validano mittente e payload.
4. Il main contatta soltanto endpoint HTTP locali compatibili OpenAI.
5. Settings e window state sono salvati in Electron `userData`.

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

