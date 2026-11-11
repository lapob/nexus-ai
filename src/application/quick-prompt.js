/**
 * @module application/quick-prompt
 * @description Passaggio monouso della domanda dalla barra rapida (processo Presence) alla UI principale:
 * un file nella cartella dati dell'utente, scritto in modo atomico, letto una sola volta e scartato se vecchio.
 * Niente argomenti da riga di comando (visibili ad altri processi) e nessun canale di rete. Se l'utente ha
 * attivato «Schermo», il file porta anche la cattura JPEG dello schermo (mai salvata altrove).
 */
const fs = require('node:fs');
const path = require('node:path');

const FILE_NAME = 'quick-prompt.json';
const MAX_AGE_MS = 60_000;
const MAX_CHARS = 4_000;
/** Il modello visivo legge immagini fino a ~1,5 MB: base64 ≈ +33%. */
const MAX_IMAGE_BASE64 = 2_050_000;

function cleanPrompt(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MAX_CHARS);
}

function cleanImage(value) {
  const encoded = String(value || '');
  return encoded && encoded.length <= MAX_IMAGE_BASE64 && /^[A-Za-z0-9+/]+=*$/.test(encoded) ? encoded : null;
}

function writeQuickPrompt(root, text, { now = Date.now(), image = null } = {}) {
  const prompt = cleanPrompt(text);
  if (!prompt) return false;
  const screen = image ? cleanImage(image) : null;
  fs.mkdirSync(root, { recursive: true });
  const target = path.join(root, FILE_NAME);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, text: prompt, createdAt: now, ...(screen ? { image: screen } : {}) }), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
  return true;
}

/** Legge e cancella subito la richiesta; null se assente, vecchia, futura o malformata. */
function takeQuickPayload(root, { now = Date.now() } = {}) {
  const target = path.join(root, FILE_NAME);
  let raw;
  try { raw = fs.readFileSync(target, 'utf8'); } catch { return null; }
  try { fs.rmSync(target, { force: true }); } catch { /* già rimosso */ }
  try {
    const value = JSON.parse(raw);
    const age = now - Number(value?.createdAt);
    if (value?.version !== 1 || !Number.isFinite(age) || age < -5_000 || age > MAX_AGE_MS) return null;
    const text = cleanPrompt(value.text);
    if (!text) return null;
    const image = value.image ? cleanImage(value.image) : null;
    return image ? { text, image } : { text };
  } catch { return null; }
}

function takeQuickPrompt(root, options) {
  return takeQuickPayload(root, options)?.text || null;
}

module.exports = { MAX_CHARS, MAX_IMAGE_BASE64, cleanPrompt, takeQuickPayload, takeQuickPrompt, writeQuickPrompt };
