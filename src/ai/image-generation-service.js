/**
 * @module ai/image-generation-service
 * @description Adapter server-side per un generatore immagini compatibile con il protocollo Nexus.
 */
const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_SIZES = new Set(['512x512', '768x768', '1024x1024', '1024x1536', '1536x1024']);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_PROTOCOLS = new Set(['openai', 'comfyui']);

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

function endpointIsLoopback(value) {
  if (!value) return false;
  const endpoint = new URL(value);
  return ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname.toLowerCase());
}

function detectImageMime(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

function buildComfyWorkflow({ prompt, size, model, seed = Math.floor(Math.random() * 2_147_483_647) }) {
  const [width, height] = size.split('x').map(Number);
  return {
    3: { class_type: 'KSampler', inputs: { seed, steps: 4, cfg: 1, sampler_name: 'euler_ancestral', scheduler: 'sgm_uniform', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    5: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
    8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: 'NexusNXS', images: ['8', 0] } }
  };
}

function endpointUrl(endpoint, relativePath) {
  const base = new URL(endpoint);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(relativePath, base).toString();
}

// #endregion
// #region 02 - Adapter provider

class ImageGenerationService {
  constructor({ endpoint = '', apiKey = '', model = '', protocol = 'openai', outputRoot = '', timeoutMs = 90_000, retryWindowMs = 300_000, fetchImpl = globalThis.fetch, now = () => Date.now(), sleep = null } = {}) {
    this.endpoint = cleanEndpoint(endpoint);
    this.apiKey = String(apiKey || '').trim();
    this.model = String(model || '').trim().slice(0, 160);
    this.protocol = IMAGE_PROTOCOLS.has(String(protocol || '').trim().toLowerCase())
      ? String(protocol).trim().toLowerCase()
      : 'openai';
    this.outputRoot = String(outputRoot || '').trim() ? path.resolve(String(outputRoot).trim()) : '';
    this.timeoutMs = Math.max(5_000, Math.min(180_000, Number(timeoutMs) || 90_000));
    this.retryWindowMs = Math.max(10_000, Math.min(900_000, Number(retryWindowMs) || 300_000));
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.sleep = sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.lastFailureAt = 0;
  }

  static fromEnvironment(env = process.env) {
    return new ImageGenerationService({
      endpoint: env.NEXUS_IMAGE_API_URL || '',
      apiKey: env.NEXUS_IMAGE_API_KEY || '',
      model: env.NEXUS_IMAGE_MODEL || '',
      protocol: env.NEXUS_IMAGE_API_MODE || 'openai',
      outputRoot: env.NEXUS_IMAGE_OUTPUT_ROOT || '',
      timeoutMs: env.NEXUS_IMAGE_TIMEOUT_MS
    });
  }

  get available() {
    const localEndpoint = endpointIsLoopback(this.endpoint);
    return Boolean(this.endpoint && this.model && typeof this.fetchImpl === 'function'
      && (this.protocol === 'comfyui' ? localEndpoint : (this.apiKey || localEndpoint)));
  }

  capabilities() {
    return { available: this.available, protocol: this.protocol, sizes: [...ALLOWED_SIZES] };
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
      const result = this.protocol === 'comfyui'
        ? await this.generateWithComfyUi({ prompt: normalizedPrompt, size, signal: controller.signal })
        : await this.generateWithOpenAi({ prompt: normalizedPrompt, size, signal: controller.signal });
      this.lastFailureAt = 0;
      return result;
    } catch (error) {
      if (error?.name !== 'AbortError' && !signal?.aborted) this.lastFailureAt = this.now();
      if (error?.name === 'AbortError') throw Object.assign(new Error('Generazione immagine scaduta.'), { code: 'IMAGE_TIMEOUT' });
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
    }
  }

  async generateWithOpenAi({ prompt, size, signal }) {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({ model: this.model, prompt, size, n: 1, response_format: 'b64_json' }),
      signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error('Il provider immagini non ha completato la richiesta.'), { code: 'IMAGE_PROVIDER_ERROR' });
    const encoded = String(payload?.data?.[0]?.b64_json || '');
    if (!encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) throw Object.assign(new Error('Risposta immagine non valida.'), { code: 'IMAGE_RESPONSE_INVALID' });
    return this.validateImage(Buffer.from(encoded, 'base64'));
  }

  async generateWithComfyUi({ prompt, size, signal }) {
    const clientId = `nexusnxs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const queued = await this.fetchImpl(endpointUrl(this.endpoint, 'prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, prompt: buildComfyWorkflow({ prompt, size, model: this.model }) }),
      signal
    });
    const queuedPayload = await queued.json().catch(() => ({}));
    if (!queued.ok || !queuedPayload.prompt_id) {
      throw Object.assign(new Error('ComfyUI non ha accettato il workflow.'), { code: 'IMAGE_PROVIDER_ERROR' });
    }
    const promptId = String(queuedPayload.prompt_id);
    let descriptor = null;
    while (!descriptor) {
      await this.sleep(250, signal);
      const history = await this.fetchImpl(endpointUrl(this.endpoint, `history/${encodeURIComponent(promptId)}`), { signal });
      const historyPayload = await history.json().catch(() => ({}));
      if (!history.ok) throw Object.assign(new Error('ComfyUI non ha restituito lo stato del workflow.'), { code: 'IMAGE_PROVIDER_ERROR' });
      const entry = historyPayload?.[promptId];
      const images = entry?.outputs && Object.values(entry.outputs).flatMap((output) => Array.isArray(output?.images) ? output.images : []);
      descriptor = images?.[0] || null;
      if (!descriptor && entry?.status?.completed) {
        throw Object.assign(new Error('ComfyUI ha concluso senza produrre un’immagine.'), { code: 'IMAGE_PROVIDER_ERROR' });
      }
    }
    const imageUrl = new URL(endpointUrl(this.endpoint, 'view'));
    imageUrl.searchParams.set('filename', String(descriptor.filename || ''));
    imageUrl.searchParams.set('subfolder', String(descriptor.subfolder || ''));
    imageUrl.searchParams.set('type', String(descriptor.type || 'output'));
    const response = await this.fetchImpl(imageUrl.toString(), { signal });
    if (!response.ok) throw Object.assign(new Error('ComfyUI non ha restituito il file generato.'), { code: 'IMAGE_PROVIDER_ERROR' });
    const image = Buffer.from(await response.arrayBuffer());
    try {
      return this.validateImage(image);
    } finally {
      this.cleanupComfyOutput(descriptor);
    }
  }

  cleanupComfyOutput(descriptor) {
    if (!this.outputRoot || String(descriptor?.type || '') !== 'output') return;
    const filename = String(descriptor?.filename || '');
    const subfolder = String(descriptor?.subfolder || '');
    if (!filename || path.basename(filename) !== filename || path.isAbsolute(subfolder)) return;
    const target = path.resolve(this.outputRoot, subfolder, filename);
    const prefix = `${this.outputRoot}${path.sep}`;
    if (!target.startsWith(prefix)) return;
    try { fs.rmSync(target, { force: true }); } catch {}
  }

  validateImage(image) {
    const mimeType = detectImageMime(image);
    if (!image.length || image.length > MAX_IMAGE_BYTES || !mimeType) {
      throw Object.assign(new Error('Formato immagine restituito non valido.'), { code: 'IMAGE_RESPONSE_INVALID' });
    }
    return { image, mimeType };
  }
}

// #endregion

module.exports = { ALLOWED_SIZES, IMAGE_PROTOCOLS, ImageGenerationService, buildComfyWorkflow, cleanEndpoint, detectImageMime, endpointIsLoopback, endpointUrl };
