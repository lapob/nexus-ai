# AI Runtime

## Architettura

```text
Renderer -> preload -> IPC applicativo -> AIRuntime -> AIProvider
                                                 |-> OllamaProvider
                                                 |-> NexusServiceProvider
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

I token di ragionamento del provider non attraversano il confine IPC. Desktop e
Android mostrano soltanto fasi sintetiche e verificabili — comprensione,
ricerca, esecuzione e controllo — mentre l'output utile continua in streaming.

## Ricerca pubblica verificabile

`research/research-policy.js` attiva la ricerca soltanto per richieste
esplicite, approfondimenti o fatti temporali. Percorsi locali, allegati,
workspace e stringhe simili a credenziali non vengono inviati a provider web.
`WebResearchService` vive esclusivamente sulla workstation e applica timeout,
limiti, cache breve, HTTPS e normalizzazione. In `auto` usa Brave quando la
chiave server è disponibile, altrimenti Wikipedia come fallback senza chiavi.

Le fonti pubbliche vengono trattate come input non fidato e non possono
autorizzare strumenti. Il modello riceve titolo, URL ed estratto e deve citare
con link Markdown. Se la verifica era necessaria ma il provider non risponde,
NexusNXS lo dichiara invece di presentare come aggiornato un dato non verificato.

## Configurazione

- `ai.provider`: per ora soltanto `ollama` in produzione;
- `ai.ollama.baseUrl`: default `http://127.0.0.1:11434`;
- `ai.ollama.timeoutMs`: default 120000 ms per generazione; il health check è comunque limitato a 3000 ms;
- `ai.chatModel`: modello principale, usato per le richieste Deep;
- `ai.fastModel`: modello a bassa latenza, usato per Quick e pianificazione; se assente usa il principale;
- `ai.embeddingModel`: selezionato automaticamente soltanto tra modelli riconosciuti come embedding;
- `ai.autoSelectModel`: attivo per default e disattivabile dalle impostazioni.
- `NEXUS_WEB_SEARCH_MODE`: `auto` oppure `off`;
- `NEXUS_WEB_SEARCH_PROVIDER`: `auto`, `brave`, `openai` o `wikipedia`;
- `NEXUS_BRAVE_SEARCH_API_KEY`: segreto opzionale solo server;
- `NEXUS_OPENAI_API_KEY`, `NEXUS_OPENAI_SEARCH_MODEL`: alternativa server-side tramite Responses API con web search; il modello resta obbligatorio per evitare attivazioni e costi impliciti;
- `NEXUS_OPENAI_RESPONSES_URL`: endpoint HTTPS, predefinito a `https://api.openai.com/v1/responses`;
- `NEXUS_WEB_SEARCH_TIMEOUT_MS`: budget di rete tra 800 e 15000 ms.

Sono accettati endpoint loopback e, con opt-in, IP privati RFC1918. La selezione automatica viene
verificata contro `/api/tags` a ogni bootstrap e adattata ai modelli realmente
presenti sul PC.

## Modelli ufficiali

La creazione tramite `/api/create` non è esposta al renderer o alla build
pubblica. Rimane una capability interna del provider, usata esclusivamente
dalla pipeline dello sviluppatore per produrre e verificare artefatti NexusNXS.
Gli utenti selezionano soltanto modelli installati e approvati nel catalogo.

Le risposte entrano nel dataset locale append-only soltanto dopo l'approvazione esplicita dell'utente. Il file `training-examples.jsonl` è salvato nei dati locali dell'app e costituisce la base verificabile per una futura pipeline LoRA/QLoRA; non modifica automaticamente i pesi. Una correzione o una scelta nel confronto genera anche una coppia `chosen`/`rejected` candidata per DPO. I contributi pubblici opt-in restano in `community-feedback-quarantine.jsonl` finché un revisore non li promuove esplicitamente.

## Stati

- `OFFLINE`: API non raggiungibile o timeout;
- `DEGRADED`: API disponibile ma nessun modello utilizzabile;
- `READY`: modello selezionato realmente disponibile;
- `ERROR`: configurazione o risposta fondamentale invalida.

## Test

`npm test` usa `MockProvider`, fetch simulate e server HTTP locali effimeri. Non
richiede Ollama, non effettua chiamate Internet e copre health, modelli, chat,
NDJSON spezzato, cancellazione, embedding, policy web, cache, credenziali,
errori e cleanup. `npm run check:research` verifica inoltre la sintassi dei tre
moduli di ricerca.
