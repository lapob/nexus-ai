/**
 * @module renderer/systems/PublicError
 * @description Impedisce che diagnostica tecnica o percorsi locali entrino nella UI pubblica.
 */

const SENSITIVE_DIAGNOSTIC = /(?:[a-z]:[\\/]|\\\\[^\\\s]+\\|file:\/\/|node:internal|node_modules|vendor[\\/]|\.dll\b|\.exe\b|\bat\s+\S+\s*\()/i;

const SAFE_MESSAGES = [
  /non (?:è|e) raggiungibile/i,
  /non disponibile/i,
  /non riuscit[oa]/i,
  /non valida/i,
  /non valido/i,
  /annullat[oa]/i,
  /tempo .* scaduto/i,
  /nessuna voce rilevata/i,
  /microfono/i,
  /già ascoltando/i,
  /deve essere/i,
  /consentit[oa]/i
];

export function publicUiError(error: unknown, fallback = 'Operazione non riuscita. Riprova.'): string {
  const objectMessage = (error as { message?: unknown } | null)?.message;
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof objectMessage === 'string'
        ? objectMessage
        : '';
  const message = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!message || message.length > 240 || SENSITIVE_DIAGNOSTIC.test(message)) return fallback;
  return SAFE_MESSAGES.some((pattern) => pattern.test(message)) ? message : fallback;
}
