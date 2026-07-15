# Stato attuale

NEXUS 0.1.0 è un'app Electron local-first integrata in una vault Obsidian.

## Implementato

- renderer graph-first con chat permanente e dock inferiore;
- retrieval lessicale dei Markdown con provenienza delle sezioni;
- modalità quick e deep con endpoint OpenAI-compatible locale;
- impostazioni locali, cancellazione richieste e apertura sicura delle note;
- sandbox Electron, CSP, validazione IPC e blocco degli endpoint remoti;
- test unitari, controllo sintattico, smoke test e doctor offline.

## Prototipale

- il knowledge graph è statico e non deriva dai wikilink;
- la cronologia vive solo nel renderer;
- il RAG è sincrono, in memoria e privo di embeddings;
- non esistono database, packaging, CI o release firmate.

## Non implementato

Agenti, voce, automazioni, memoria persistente e tool execution non fanno parte
della Foundation Phase.

