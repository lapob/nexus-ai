/**
 * @module infrastructure/electron/in-app-dialog
 * @description Conferme del processo principale mostrate con il dialogo integrato dell'interfaccia, con la stessa
 * firma di `dialog.showMessageBox(window, options)`. Sicurezza e affidabilità:
 * - id casuale monouso per richiesta; la risposta vale solo dal webContents della finestra che l'ha ricevuta;
 * - se l'interfaccia non conferma di averla mostrata entro `readyMs` si usa il dialogo di sistema (mai bloccati);
 * - finestra chiusa, scadenza o qualsiasi errore = rifiuto (cancelId): il consenso non è mai implicito;
 * - solo dialoghi a due pulsanti; gli altri restano nativi.
 */
const crypto = require('node:crypto');

// #region 01 — Richieste in attesa

function toneFor(type) {
  if (type === 'error') return 'danger';
  if (type === 'warning') return 'warning';
  return 'default';
}

function createInAppDialog({ ipcMain, nativeDialog, channels, readyMs = 1_500, timeoutMs = 10 * 60_000, logger = null }) {
  const pending = new Map();

  ipcMain.handle(channels.confirmAnswer, (event, payload) => {
    const id = String(payload?.id || '');
    const item = pending.get(id);
    if (!item || event.sender !== item.sender) return { status: 'ignored' };
    if (payload?.answer === 'shown') { item.shown(); return { status: 'shown' }; }
    item.finish(payload?.answer === true);
    return { status: 'answered' };
  });

  async function showMessageBox(window, options = {}) {
    const buttons = Array.isArray(options.buttons) ? options.buttons : [];
    const cancelId = Number.isInteger(options.cancelId) ? options.cancelId : 0;
    const confirmId = buttons.length === 2 ? 1 - cancelId : -1;
    const sender = window && !window.isDestroyed?.() ? window.webContents : null;
    if (confirmId < 0 || !sender || sender.isDestroyed?.()) return nativeDialog.showMessageBox(...(window ? [window, options] : [options]));

    const id = crypto.randomBytes(16).toString('hex');
    const outcome = await new Promise((resolve) => {
      let readyTimer = null;
      let limitTimer = null;
      let settled = false;
      const cleanup = () => {
        clearTimeout(readyTimer); clearTimeout(limitTimer);
        pending.delete(id);
        window.removeListener?.('closed', onClosed);
      };
      const finish = (value) => { if (settled) return; settled = true; cleanup(); resolve(value); };
      const onClosed = () => finish({ approved: false });
      pending.set(id, {
        sender,
        shown: () => { clearTimeout(readyTimer); },
        finish: (approved) => finish({ approved })
      });
      window.once?.('closed', onClosed);
      // L'interfaccia non risponde (caricamento, crash del renderer): dialogo di sistema come riserva.
      readyTimer = setTimeout(() => finish({ fallback: true }), readyMs);
      limitTimer = setTimeout(() => finish({ approved: false }), timeoutMs);
      try {
        sender.send(channels.confirmRequest, {
          id, tone: toneFor(options.type), title: options.title ? `${options.title}` : '', message: options.message || '', detail: options.detail || '',
          cancelLabel: buttons[cancelId], confirmLabel: buttons[confirmId]
        });
      } catch { finish({ fallback: true }); }
    });

    if (outcome.fallback) {
      logger?.warn?.('Conferma integrata non disponibile: uso il dialogo di sistema.', { title: options.title });
      if (window.isDestroyed?.()) return { response: cancelId, checkboxChecked: false };
      return nativeDialog.showMessageBox(window, options);
    }
    return { response: outcome.approved ? confirmId : cancelId, checkboxChecked: false };
  }

  return Object.freeze({ showMessageBox, pendingCount: () => pending.size });
}

// #endregion
// #region 02 — Esportazioni

module.exports = { createInAppDialog };

// #endregion
