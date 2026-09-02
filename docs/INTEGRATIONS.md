# Integrazioni

## Runtime AI e Ollama

NEXUSNXS usa un runtime indipendente dal provider. La prima implementazione è
`OllamaProvider`, basata sulle API native locali `/api/version`, `/api/tags`,
`/api/chat`, `/api/embed` e `/api/create`. Il renderer non conosce endpoint e non può accedere
alla rete: chat, health, modelli, streaming, cancellazione ed embedding passano
da API preload esplicite e handler IPC validati.

In sviluppo NEXUSNXS può usare un Ollama già installato. Il setup pubblico usa
NexusNXS Service via HTTPS e non include né scarica modelli
selezionati dal profilo hardware. Nessun modello viene incorporato
automaticamente. La build pubblica non espone creazione, addestramento o
importazione di modelli: gli artefatti ufficiali sono prodotti esclusivamente
dalla pipeline privata dello sviluppatore. Il doctor resta offline e non
contatta il runtime senza richiesta esplicita.

Documentazione ufficiale: https://docs.ollama.com/api/introduction

## Runtime azioni

È disponibile una prima integrazione agentica sincrona e monostep. Il modello
locale produce una proposta JSON, il main process la valida contro un catalogo
chiuso e crea un ticket di cinque minuti. Ogni consumo apre un dialogo nativo;
il rifiuto non esegue nulla. Dettagli in `ACTION_RUNTIME.md`.

Orchestrazione multi-agent, scheduler, permessi persistenti e tool di terze
parti restano fuori da questa fase.
