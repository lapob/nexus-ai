# Mappa del codice NEXUSNXS

Questa pagina è il punto di ingresso per leggere il progetto senza dover
scorrere ogni file. In VS Code, Cursor e IDE compatibili cerca `#region` per
saltare direttamente alle sezioni principali.

## Percorso di avvio

```text
src/main.js
  -> application/bootstrap.js
     -> infrastructure/electron/app-lifecycle.js
        -> infrastructure/electron/renderer-protocol.js
        -> infrastructure/electron/create-main-window.js
     -> application/register-ipc.js
        -> ai/ai-runtime.js
        -> knowledge/rag.js
        -> agents/action-runtime.js
```

## Interfaccia unica (web e desktop)

```text
web/src/main.tsx            Mount React, font Inter e JetBrains Mono
web/src/App.tsx             Shell: conversazioni, composer, voce live, palette, preferenze
web/src/Core.tsx            Entità cosmica: particelle WebGPU (WGSL) con fallback Canvas
web/src/voice.ts            Registrazione, barge-in, filtro rumore, riproduzione progressiva
web/src/Markdown.tsx        Markdown sicuro: codice, tabelle, callout, formule, checklist
web/src/platform.ts         Web (API guest) o desktop (ponte IPC del preload)
web/src/ControlCenter.tsx   Desktop: modelli, profilo, telefono, memoria, workspace, sistema, dati
web/src/desktopPresence.ts  Desktop: parola di attivazione, Presence, avvisi proattivi
vite.config.ts              Build desktop → renderer-dist (nexus://app)
web/vite.config.ts          Build pubblica → web-dist, incorporata dal gateway e dall'edge
```
## Processo privilegiato

| File | Responsabilità |
|---|---|
| `application/ipc-contracts.js` | nomi dei canali e validazione payload |
| `application/register-ipc.js` | handler IPC e confine renderer/main |
| `application/reasoning.js` | modalità Quick/Deep e fusione delle fonti |
| `agents/action-runtime.js` | piano, consenso monouso, esecuzione e audit |
| `agents/agent-loop.js` | ciclo multi-step con function calling nativo, consenso, budget e annullamento |
| `agents/typed-tools.js` | strumenti con schema JSON validato, sopra il ToolBus |
| `agents/core-tools.js` | strumenti base: ora, calcolo esatto, giorni tra date, knowledge locale, ricerca web |
| `agents/action-tools.js` | azioni PC e integrazioni MCP/n8n come strumenti `pc-*`/`mcp-*`, solo via ActionRuntime; lettura obbligatoria prima di sovrascrivere |
| `remote/public-web-app.js` | web app pubblica unica: incorpora `web-dist` in un documento firmato con nonce (gateway ed edge), serve `/assets/*`, `/next` → `/` |
| `web/` | nuova web app pubblica React/TypeScript: streaming, nucleo WebGPU, palette ⌘K, Markdown sicuro |
| `agents/tool-output-guard.js` | rimuove dagli output degli strumenti le frasi che istruiscono l'assistente |
| `application/memory-consolidation.js` | memoria automatica opt-in: riassunti episodici e fatti dichiarati, filtri sensibili/injection, vettori |
| `application/agent-chat.js` | modalità agente opt-in nella chat desktop: idoneità, strumenti del turno, fonti, consenso nativo |
| `core/security.js` | endpoint locali e percorsi autorizzati |
| `infrastructure/storage/portable-paths.js` | risoluzione della vault e storage locale |
| `infrastructure/electron/window-state.js` | stato e posizione sicura della finestra |
| `infrastructure/windows/desktop-application-catalog.js` | catalogo statico, stato metadata-only e avvio sicuro delle app Windows |
| `voice/native-speech.js` | adapter del backend vocale Windows/Whisper |
| `voice/neural-speech.js` | worker Kokoro, timeout e cancellazione last-one-wins |
| `docs/VOICE_RUNTIME.md` | flusso, interruzione e criteri della risposta parlata |
| `docs/ADAPTIVE_RUNTIME.md` | profili hardware, ruoli modello e percorso ibrido |

## AI e knowledge

| File | Responsabilità |
|---|---|
| `ai/ai-provider.js` | contratto astratto dei provider |
| `ai/ai-provider-registry.js` | registrazione dei provider |
| `ai/ai-runtime.js` | provider attivo, richieste e cancellazione |
| `ai/providers/ollama-provider.js` | adapter Ollama locale/LAN, catalogo, chat, embedding e primitive interne per la pipeline release |
| `knowledge/rag.js` | indicizzazione Markdown e retrieval |
| `scripts/build-knowledge-catalog.js` | catalogo, SQLite FTS, grafo, hash e fonti derivate |
| `scripts/audit-knowledge-governance.js` | provenance, licenze, freshness, trust tier, duplicati e claim |
| `scripts/benchmark-private-knowledge.js` | Hit@K, MRR e coverage delle citazioni |

## Test utili durante le modifiche

```powershell
npm run check:sections  # convenzione commenti e regioni
npm run check           # sintassi
npm test                # test unitari
npm run smoke           # Electron, preload, CSP e IPC reali
npm run verify          # check, test, smoke, doctor e audit runtime
npm run verify:full     # verifica completa più QA visivo e audit toolchain
npm run release         # verifica, installer Windows e controllo del pacchetto
```

## Ricerca rapida

- `@module`: intestazione e responsabilità di ogni file sorgente.
- `#region`: inizio di una sezione comprimibile nell'IDE.
- `NEXUSNXS-EGG`: easter egg intenzionale e innocuo.
- `SECURITY:`: decisione che non deve essere indebolita.
- `CONSENT:`: operazione soggetta a consenso umano.

Il controllo `npm run check:sections` copre JavaScript, TypeScript, TSX, CSS,
HTML, PowerShell, Python, gli script di progetto e `vite.config.ts`.
