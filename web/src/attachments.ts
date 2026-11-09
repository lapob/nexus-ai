/**
 * @module web/attachments
 * @description Validazione locale degli allegati. Ospiti pubblici: gli stessi limiti del gateway (2 file da 1,5 MB).
 * Telefono collegato al PC del proprietario: nessun limite di numero, solo il tetto tecnico della richiesta.
 */
import type { Attachment } from './api';

export interface AttachmentLimits { maxCount: number; maxBytes: number }

/** Ospiti pubblici: protezione del servizio condiviso. */
export const GUEST_LIMITS: AttachmentLimits = { maxCount: 2, maxBytes: 1_500_000 };
/** Proprietario dal telefono collegato: il corpo della richiesta privata arriva a 256 MiB (base64 ≈ +33%). */
export const OWNER_LIMITS: AttachmentLimits = { maxCount: Number.POSITIVE_INFINITY, maxBytes: 190 * 1024 * 1024 };

export const limitsFor = (kind: string): AttachmentLimits => kind === 'paired' ? OWNER_LIMITS : GUEST_LIMITS;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_TYPES = new Set(['application/pdf', 'application/json', 'application/xml']);
const TEXT_EXTENSIONS = /\.(?:txt|md|csv|tsv|log|json|xml|ya?ml|js|ts|tsx|jsx|py|java|c|cpp|h|cs|go|rs|rb|php|html|css|sql|sh|ps1|ini|toml|srt|vtt|tex)$/i;

export const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,text/*,.md,.csv,.tsv,.log,.json,.xml,.yaml,.yml,.js,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.sql,.sh,.ps1,.toml,.srt,.vtt,.tex';

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

/** Lato lungo massimo e peso oltre i quali una foto viene ridotta: il modello visivo accetta immagini fino a ~1,5 MB. */
const IMAGE_MAX_SIDE = 2048;
const IMAGE_TARGET_BYTES = 1_400_000;

/** Riduce le foto del telefono (spesso 3–12 MB) a JPEG leggibile dal modello visivo; se non serve, restituisce il file. */
export async function fitImage(file: File): Promise<File> {
  if (!IMAGE_TYPES.has(file.type) || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  try {
    if (file.size <= IMAGE_TARGET_BYTES && Math.max(bitmap.width, bitmap.height) <= IMAGE_MAX_SIDE) return file;
    for (const side of [IMAGE_MAX_SIDE, 1600, 1280, 1024]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
      if (blob && blob.size <= IMAGE_TARGET_BYTES) return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
    return file;
  } finally { bitmap.close(); }
}

export interface Pending extends Attachment { id: string; preview?: string }

/** Prepara i file scelti; gli errori sono messaggi pronti per l'utente. */
export async function prepareFiles(files: File[], current: Pending[], limits: AttachmentLimits = GUEST_LIMITS): Promise<{ accepted: Pending[]; errors: string[] }> {
  const accepted: Pending[] = [];
  const errors: string[] = [];
  for (const original of files) {
    if (current.length + accepted.length >= limits.maxCount) { errors.push(`Puoi allegare al massimo ${limits.maxCount} file per messaggio.`); break; }
    const mime = acceptedMime(original);
    if (!mime) { errors.push(`${original.name}: formato non supportato.`); continue; }
    if (!original.size) { errors.push(`${original.name}: file vuoto.`); continue; }
    const file = IMAGE_TYPES.has(mime) ? await fitImage(original) : original;
    const total = [...current, ...accepted].reduce((sum, item) => sum + item.size, 0) + file.size;
    if (file.size > limits.maxBytes || (Number.isFinite(limits.maxCount) ? false : total > limits.maxBytes)) {
      errors.push(`${original.name}: supera ${formatSize(limits.maxBytes)}${Number.isFinite(limits.maxCount) ? '' : ' in totale per messaggio'}.`);
      continue;
    }
    accepted.push({ id: crypto.randomUUID(), name: file.name.slice(0, 120), mime: file.type || mime, size: file.size, data: base64(await file.arrayBuffer()),
      ...(IMAGE_TYPES.has(file.type || mime) ? { preview: URL.createObjectURL(file) } : {}) });
  }
  return { accepted, errors };
}

export function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
