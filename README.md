# NEXUS — local-first cognitive platform

Chat desktop locale che recupera contesto dalla vault `Nexus` senza modificarla. L'app indicizza soltanto i file Markdown esterni a `NexusAI`, `.obsidian` e cartelle nascoste.

## Avvio

Esegui i comandi dalla cartella `.AI` contenuta nella vault Nexus.

```powershell
npm start
```

Le dipendenze devono essere installate soltanto quando `node_modules` non è già
presente. Il progetto non carica automaticamente file `.env`: le variabili
documentate in `.env.example` vengono lette dall'ambiente del processo.

Gli strumenti di sviluppo sono disabilitati nell'app: menu, DevTools, ispezione contestuale e relative scorciatoie non sono disponibili.

## Verifica offline

```powershell
npm run verify
```

Diagnostica della configurazione, senza contattare endpoint o modificare la vault:

```powershell
npm run doctor
```

Il comando controlla sintassi, retrieval, esclusioni della vault, blocco degli URL remoti, path traversal, avvio reale Electron e vulnerabilità delle dipendenze.

Apri **Impostazioni** e configura un motore locale compatibile con `POST /chat/completions`:

- Ollama: `http://127.0.0.1:11434/v1` e un modello installato;
- LM Studio: `http://127.0.0.1:1234/v1`.

L'app accetta esclusivamente `localhost`, `127.0.0.1` e `::1`. Blocca richieste HTTP esterne, nuove finestre e navigazione fuori dall'interfaccia. Non contiene analytics, telemetria, CDN o link Internet. URL locale e nome del modello sono conservati nella directory dati di Electron.

## Limiti della bozza

Il retrieval è locale e lessicale, senza database vettoriale. È intenzionalmente trasparente e sufficiente per validare interfaccia, prompt, citazioni e flusso RAG prima di aggiungere embedding, reranking e memoria persistente.

## Documentazione

- `docs/CURRENT_STATE.md`: stato implementativo e limiti;
- `docs/ARCHITECTURE.md`: componenti e confini;
- `docs/RAG_FLOW.md`: pipeline di retrieval attuale;
- `docs/ROADMAP.md`: sequenza evolutiva;
- `docs/INTEGRATIONS.md`: confini futuri per Ollama e agent runtime.

NEXUS è attualmente un prototipo fondazionale, non una release production-ready.
