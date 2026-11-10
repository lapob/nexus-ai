/**
 * @module application/quick-prompt
 * @description Passaggio monouso della domanda dalla barra rapida (processo Presence) alla UI principale:
 * un file nella cartella dati dell'utente, scritto in modo atomico, letto una sola volta e scartato se vecchio.
 * Niente argomenti da riga di comando (visibili ad altri processi) e nessun canale di rete.
 */
const fs = require('node:fs');
const path = require('node:path');

const FILE_NAME = 'quick-prompt.json';
const MAX_AGE_MS = 60_000;
const MAX_CHARS = 4_000;

function cleanPrompt(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MAX_CHARS);
}

function writeQuickPrompt(root, text, { now = Date.now() } = {}) {
  const prompt = cleanPrompt(text);
  if (!prompt) return false;
  fs.mkdirSync(root, { recursive: true });
  const target = path.join(root, FILE_NAME);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, text: prompt, createdAt: now }), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
  return true;
}

/** Legge e cancella subito il prompt; null se assente, vecchio, futuro o malformato. */
function takeQuickPrompt(root, { now = Date.now() } = {}) {
  const target = path.join(root, FILE_NAME);
  let raw;
  try { raw = fs.readFileSync(target, 'utf8'); } catch { return null; }
  try { fs.rmSync(target, { force: true }); } catch { /* già rimosso */ }
  try {
    const value = JSON.parse(raw);
    const age = now - Number(value?.createdAt);
    if (value?.version !== 1 || !Number.isFinite(age) || age < -5_000 || age > MAX_AGE_MS) return null;
    return cleanPrompt(value.text) || null;
  } catch { return null; }
}

module.exports = { MAX_CHARS, cleanPrompt, takeQuickPrompt, writeQuickPrompt };
