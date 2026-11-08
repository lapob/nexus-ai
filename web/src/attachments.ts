/**
 * @module web/attachments
 * @description Validazione locale degli allegati con gli stessi limiti del gateway: massimo 2 file da 1,5 MB, tipi ammessi espliciti.
 */
import type { Attachment } from './api';

export const MAX_ATTACHMENTS = 2;
export const MAX_BYTES = 1_500_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_TYPES = new Set(['application/pdf', 'application/json', 'application/xml']);
const TEXT_EXTENSIONS = /\.(?:txt|md|csv|log|json|xml|ya?ml|js|ts|tsx|jsx|py|java|c|cpp|h|cs|go|rs|rb|php|html|css|sql|sh|ps1|ini|toml)$/i;

export const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,text/*,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.sql,.sh,.ps1,.toml';

/** Tipo MIME accettato dal gateway, oppure null. Il codice sorgente viene inviato come testo. */
export function acceptedMime(file: File): string | null {
  if (IMAGE_TYPES.has(file.type) || DOCUMENT_TYPES.has(file.type)) return file.type;
  if (file.type.startsWith('text/')) return file.type.split(';')[0];
  if (TEXT_EXTENSIONS.test(file.name)) return 'text/plain';
  return null;
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export interface Pending extends Attachment { id: string; preview?: string }

/** Prepara i file scelti; gli errori sono messaggi pronti per l'utente. */
export async function prepareFiles(files: File[], current: Pending[]): Promise<{ accepted: Pending[]; errors: string[] }> {
  const accepted: Pending[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (current.length + accepted.length >= MAX_ATTACHMENTS) { errors.push(`Puoi allegare al massimo ${MAX_ATTACHMENTS} file per messaggio.`); break; }
    const mime = acceptedMime(file);
    if (!mime) { errors.push(`${file.name}: formato non supportato.`); continue; }
    if (file.size > MAX_BYTES) { errors.push(`${file.name}: supera 1,5 MB.`); continue; }
    if (!file.size) { errors.push(`${file.name}: file vuoto.`); continue; }
    accepted.push({ id: crypto.randomUUID(), name: file.name.slice(0, 120), mime, size: file.size, data: base64(await file.arrayBuffer()),
      ...(IMAGE_TYPES.has(mime) ? { preview: URL.createObjectURL(file) } : {}) });
  }
  return { accepted, errors };
}

export function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
