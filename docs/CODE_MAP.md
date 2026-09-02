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

## Renderer

```text
renderer/main.tsx                        Mount React
renderer/App.tsx                         Composition root della UI
renderer/hooks/useNexusController.ts     Chat, voce, task, azioni e settings
renderer/components/UIOverlay.tsx        Isola contestuale dinamica
renderer/components/SettingsOverlay.tsx  Voce, aspetto e identità personale
renderer/components/ModelSwitcher.tsx    Selettore rapido del modello attivo
renderer/components/VoiceVisualizer.tsx  Confine della presenza WebGL
renderer/scene/MainScene.tsx             Canvas adattivo e caricamento lazy
renderer/scene/ParticleEngine.tsx        Presenza neurale GPU
renderer/scene/SaturnVisualizer.tsx      Presenza planetaria GPU
renderer/systems/VoiceRecognition.ts     Dispositivi, calibrazione e spettro
renderer/systems/AnimationController.ts  Profili e transizioni degli stati
renderer/systems/InterfacePreferences.ts Preferenze e qualità adattiva
renderer/systems/PublicError.ts          Sanitizzazione degli errori pubblici
renderer/styles/app.css                  Layout, tipografia e responsive
renderer/styles/settings-minimal.css     Tema isolato delle impostazioni
renderer/styles/surfaces-minimal.css     Composer, modelli e superfici temporanee
```

## Processo privilegiato

| File | Responsabilità |
|---|---|
| `application/ipc-contracts.js` | nomi dei canali e validazione payload |
| `application/register-ipc.js` | handler IPC e confine renderer/main |
| `application/reasoning.js` | modalità Quick/Deep e fusione delle fonti |
| `agents/action-runtime.js` | piano, consenso monouso, esecuzione e audit |
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
