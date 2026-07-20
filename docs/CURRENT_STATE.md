# Stato attuale

NEXUS 0.1.0 è un'app Electron local-first integrata in una vault Obsidian.

## Implementato

- renderer graph-first fullscreen con HUD, dock flottante, pannello contestuale temporaneo, command palette e chat overlay;
- retrieval lessicale dei Markdown con provenienza delle sezioni;
- modalità quick e deep con endpoint OpenAI-compatible locale;
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
- il RAG è sincrono, in memoria e privo di embeddings;
- non esistono database, packaging, CI o release firmate.

## Non implementato

Agenti, voce, automazioni, memoria persistente e tool execution non fanno parte
della Foundation Phase.

La ricostruzione UI è completata. La prossima fase è dedicata all'intelligenza
locale: modelli, embeddings, RAG reale, memoria e orchestrazione degli agenti.

## Responsabilità del main process

`src/main.js` è ora un entry point minimale. Il bootstrap applicativo compone i
servizi; lifecycle e hardening della finestra vivono negli adapter Electron; gli
handler IPC sono registrati dal layer application. Il refactoring non modifica
funzionalità, UI, canali IPC, retrieval o reasoning.
