# AI Runtime

## Architettura

```text
Renderer -> preload -> IPC applicativo -> AIRuntime -> AIProvider
                                                 |-> OllamaProvider
                                                 `-> MockProvider (solo test)
```

`AIRuntime` mantiene un solo provider attivo, normalizza gli errori e possiede
la mappa limitata `requestId -> AbortController`. `AIProviderRegistry` associa
un nome a una factory. La policy Quick/Deep e il contesto RAG restano nel layer
applicativo, non nel provider.

## Contratto provider

Un provider implementa `initialize`, `health`, `listModels`, `getCurrentModel`,
`setModel`, `getCapabilities`, `chat`, `streamChat`, `cancel`, `embed` e
`shutdown`. Input e output vengono validati a runtime; il modello errori usa
codici `AI_*` stabili e conserva la causa soltanto nei log del main process.

Per aggiungere un provider: implementare il contratto, registrare una factory
nel composition root e aggiungere test isolati. Nessun codice UI o RAG deve
cambiare.

## Streaming e cancellazione

Ollama invia NDJSON. Il provider conserva i chunk incompleti, emette una sola
sequenza terminale e restituisce anche il risultato aggregato. Il main inoltra
eventi tipizzati con `requestId` su un solo canale; il preload espone
`onStreamEvent()` che restituisce obbligatoriamente una funzione unsubscribe.
La UI filtra gli eventi per richiesta. `cancel(requestId)` abortisce soltanto la
fetch associata e il cleanup avviene in `finally` e allo shutdown.

## Configurazione

- `ai.provider`: per ora soltanto `ollama` in produzione;
- `ai.ollama.baseUrl`: default `http://127.0.0.1:11434`;
- `ai.ollama.timeoutMs`: default 120000 ms per generazione; il health check è comunque limitato a 3000 ms;
- `ai.chatModel`: nessun default implicito;
- `ai.embeddingModel`: nessun default implicito.

Sono accettati soltanto endpoint loopback. I modelli devono essere selezionati
esplicitamente e verificati tramite `/api/tags`.

## Stati

- `OFFLINE`: API non raggiungibile o timeout;
- `DEGRADED`: API disponibile ma nessun modello utilizzabile;
- `READY`: modello selezionato realmente disponibile;
- `ERROR`: configurazione o risposta fondamentale invalida.

## Test

`npm test` usa `MockProvider` e server HTTP locali effimeri. Non richiede Ollama,
non effettua chiamate Internet e copre health, modelli, chat, NDJSON spezzato,
cancellazione, embedding, errori e cleanup.
