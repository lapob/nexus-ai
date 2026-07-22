# Stato attuale

NEXUS 0.1.0 è un'app Electron local-first integrata in una vault Obsidian.

## Implementato

- renderer graph-first fullscreen con HUD, dock flottante, pannello contestuale temporaneo, command palette e chat overlay;
- retrieval lessicale dei Markdown con provenienza delle sezioni;
- modalità quick e deep collegate a un runtime AI indipendente dal provider;
- OllamaProvider con health, modelli, chat, streaming, cancellazione ed embedding;
- impostazioni locali, cancellazione richieste e apertura sicura delle note;
- sandbox Electron, CSP, validazione IPC e blocco degli endpoint remoti;
- main process modulare con bootstrap, lifecycle, finestra e registry IPC separati;
- test unitari, controllo sintattico, smoke test e doctor offline.

Il bootstrap del renderer è operativo. Poiché il preload Electron è sandboxed e
non può caricare moduli locali, la mappa minima dei canali IPC è dichiarata anche
nel preload e verificata automaticamente contro il contratto autoritativo. Se il
bootstrap riesce ma il modello locale non risponde, l'interfaccia resta utilizzabile
e mostra lo stato `OFFLINE`; non simula `READY`.

## Prototipale

- il knowledge graph è statico e non deriva dai wikilink;
- la cronologia vive solo nel renderer;
- il RAG è sincrono, in memoria e non usa ancora l'API embedding disponibile;
- non esistono database, packaging, CI o release firmate.

## Non implementato

Agenti, voce, automazioni, memoria persistente e tool execution non fanno parte
della Foundation Phase.

La ricostruzione UI è completata. L'astrazione runtime è pronta, ma l'integrazione
non è dichiarata validata finché non verrà provata con Ollama reale e un modello
locale scelto esplicitamente.

## Responsabilità del main process

`src/main.js` è ora un entry point minimale. Il bootstrap applicativo compone i
servizi; lifecycle e hardening della finestra vivono negli adapter Electron; gli
handler IPC sono registrati dal layer application. Il refactoring non modifica
funzionalità, UI, canali IPC, retrieval o reasoning.
