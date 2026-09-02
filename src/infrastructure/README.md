# Infrastructure

Adapter verso Electron, filesystem e runtime esterni.

- `electron/app-lifecycle.js` governa readiness, sessione e chiusura;
- `electron/create-main-window.js` crea la finestra, applica hardening e
  supporta gli smoke screenshot.
- `electron/window-state.js` valida e conserva posizione e dimensione;
- `storage/portable-paths.js` separa vault, installazione e dati utente.

Questo layer non decide policy RAG, contenuti della chat o autorizzazioni.
