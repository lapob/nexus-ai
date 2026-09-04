/**
 * @module ai/image-generation-service
 * @description Adapter server-side per provider immagini OpenAI-compatible.
 */
const ALLOWED_SIZES = new Set(['512x512', '768x768', '1024x1024', '1024x1536', '1536x1024']);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

// #region 01 - Validazione endpoint e contenuti

function cleanEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const endpoint = new URL(raw);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname.toLowerCase());
  if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback))
    || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('NEXUS_IMAGE_API_URL deve essere HTTPS oppure loopback HTTP e non contenere credenziali.');
  }
  return endpoint.toString();
}

function detectImageMime(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

// #endregion
// #region 02 - Adapter provider

class ImageGenerationService {
  constructor({ endpoint = '', apiKey = '', model = '', timeoutMs = 90_000, retryWindowMs = 300_000, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
    this.endpoint = cleanEndpoint(endpoint);
    this.apiKey = String(apiKey || '').trim();
    this.model = String(model || '').trim().slice(0, 160);
    this.timeoutMs = Math.max(5_000, Math.min(180_000, Number(timeoutMs) || 90_000));
    this.retryWindowMs = Math.max(10_000, Math.min(900_000, Number(retryWindowMs) || 300_000));
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.lastFailureAt = 0;
  }

  static fromEnvironment(env = process.env) {
    const apiKey = env.NEXUS_IMAGE_API_KEY || env.NEXUS_OPENAI_API_KEY || env.OPENAI_API_KEY || '';
    const model = env.NEXUS_IMAGE_MODEL || '';
    return new ImageGenerationService({
      endpoint: env.NEXUS_IMAGE_API_URL || (apiKey && model ? 'https://api.openai.com/v1/images/generations' : ''),
      apiKey,
      model,
      timeoutMs: env.NEXUS_IMAGE_TIMEOUT_MS
    });
  }

  get available() {
    return Boolean(this.endpoint && this.model && typeof this.fetchImpl === 'function');
  }

  capabilities() {
    return { available: this.available, sizes: [...ALLOWED_SIZES] };
  }

  capabilityState() {
    if (!this.available) return { state: 'unavailable', mode: 'off' };
    if (this.lastFailureAt && this.now() - this.lastFailureAt < this.retryWindowMs) {
      return { state: 'degraded', mode: 'retrying' };
    }
    return { state: 'available', mode: 'server-side' };
  }

  async generate({ prompt, size = '1024x1024', signal } = {}) {
    if (!this.available) throw Object.assign(new Error('Generazione immagini non configurata.'), { code: 'IMAGE_BACKEND_UNAVAILABLE' });
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt || normalizedPrompt.length > 2_000) throw Object.assign(new Error('Prompt immagine non valido.'), { code: 'IMAGE_PROMPT_INVALID' });
    if (!ALLOWED_SIZES.has(size)) throw Object.assign(new Error('Formato immagine non supportato.'), { code: 'IMAGE_SIZE_INVALID' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener?.('abort', abort, { once: true });
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({ model: this.model, prompt: normalizedPrompt, size, n: 1, response_format: 'b64_json' }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error('Il provider immagini non ha completato la richiesta.'), { code: 'IMAGE_PROVIDER_ERROR' });
      const encoded = String(payload?.data?.[0]?.b64_json || '');
      if (!encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) throw Object.assign(new Error('Risposta immagine non valida.'), { code: 'IMAGE_RESPONSE_INVALID' });
      const image = Buffer.from(encoded, 'base64');
      const mimeType = detectImageMime(image);
      if (!image.length || image.length > MAX_IMAGE_BYTES || !mimeType) throw Object.assign(new Error('Formato immagine restituito non valido.'), { code: 'IMAGE_RESPONSE_INVALID' });
      this.lastFailureAt = 0;
      return { image, mimeType };
    } catch (error) {
      if (error?.name !== 'AbortError' && !signal?.aborted) this.lastFailureAt = this.now();
      if (error?.name === 'AbortError') throw Object.assign(new Error('Generazione immagine scaduta.'), { code: 'IMAGE_TIMEOUT' });
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
    }
  }
}

// #endregion

module.exports = { ALLOWED_SIZES, ImageGenerationService, cleanEndpoint, detectImageMime };
