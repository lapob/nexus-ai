const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ImageGenerationService, buildComfyWorkflow, cleanEndpoint, detectImageMime } = require('../src/ai/image-generation-service');

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

test('image provider accepts HTTPS and loopback but rejects unsafe endpoints', () => {
  assert.equal(cleanEndpoint('https://images.example/v1/images/generations'), 'https://images.example/v1/images/generations');
  assert.equal(cleanEndpoint('http://127.0.0.1:8188/v1/images/generations'), 'http://127.0.0.1:8188/v1/images/generations');
  assert.throws(() => cleanEndpoint('http://images.example/v1/images/generations'));
  assert.throws(() => cleanEndpoint('https://user:secret@images.example/v1/images/generations'));
});

test('unconfigured image generation fails closed', async () => {
  const service = new ImageGenerationService();
  assert.equal(service.capabilities().available, false);
  assert.deepEqual(service.capabilityState(), { state: 'unavailable', mode: 'off' });
  await assert.rejects(() => service.generate({ prompt: 'Nebulosa turchese' }), { code: 'IMAGE_BACKEND_UNAVAILABLE' });
});

test('image generation sends credentials only server-side and validates bytes', async () => {
  let request;
  const service = new ImageGenerationService({
    endpoint: 'https://images.example/v1/images/generations', apiKey: 'server-secret', model: 'nexus-image',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) };
    }
  });
  const result = await service.generate({ prompt: 'Un nucleo cosmico', size: '512x512' });
  assert.equal(request.options.headers.Authorization, 'Bearer server-secret');
  assert.equal(JSON.parse(request.options.body).model, 'nexus-image');
  assert.equal(result.mimeType, 'image/png');
  assert.deepEqual(result.image, png);
  assert.equal(detectImageMime(result.image), 'image/png');
  assert.deepEqual(service.capabilityState(), { state: 'available', mode: 'server-side' });
});

test('image provider reports a retrying state after a real failure', async () => {
  let now = 1_000;
  const service = new ImageGenerationService({
    endpoint: 'https://images.example/v1/images/generations', apiKey: 'server-secret', model: 'nexus-image', now: () => now,
    fetchImpl: async () => ({ ok: false, json: async () => ({}) })
  });
  await assert.rejects(() => service.generate({ prompt: 'Nebulosa' }), { code: 'IMAGE_PROVIDER_ERROR' });
  assert.deepEqual(service.capabilityState(), { state: 'degraded', mode: 'retrying' });
  now += 301_000;
  assert.deepEqual(service.capabilityState(), { state: 'available', mode: 'server-side' });
});

test('il generatore immagini locale funziona senza chiave e non eredita provider esterni', () => {
  const off = ImageGenerationService.fromEnvironment({ OPENAI_API_KEY: 'server-secret', NEXUS_IMAGE_MODEL: 'image-model' });
  assert.equal(off.available, false, 'nessun endpoint esterno viene attivato implicitamente');
  const local = ImageGenerationService.fromEnvironment({
    NEXUS_IMAGE_API_URL: 'http://127.0.0.1:8188/v1/images/generations',
    NEXUS_IMAGE_MODEL: 'nexus-image'
  });
  assert.equal(local.available, true);
  const remoteWithoutKey = ImageGenerationService.fromEnvironment({
    NEXUS_IMAGE_API_URL: 'https://images.example/v1/images/generations',
    NEXUS_IMAGE_MODEL: 'nexus-image'
  });
  assert.equal(remoteWithoutKey.available, false, 'un endpoint remoto non autenticato resta disabilitato');
});

test('ComfyUI usa un workflow SDXL locale e recupera il file generato', async () => {
  const requests = [];
  const service = new ImageGenerationService({
    endpoint: 'http://127.0.0.1:8188/',
    model: 'sd_xl_turbo_1.0_fp16.safetensors',
    protocol: 'comfyui',
    sleep: async () => {},
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith('/prompt')) return { ok: true, json: async () => ({ prompt_id: 'job-1' }) };
      if (url.endsWith('/history/job-1')) return { ok: true, json: async () => ({ 'job-1': { status: { completed: true }, outputs: { 9: { images: [{ filename: 'nexus.png', subfolder: '', type: 'output' }] } } } }) };
      if (url.includes('/view?')) return { ok: true, arrayBuffer: async () => png };
      throw new Error(`Richiesta inattesa: ${url}`);
    }
  });
  const result = await service.generate({ prompt: 'Un nucleo cosmico', size: '768x768' });
  const workflow = JSON.parse(requests[0].options.body).prompt;
  assert.equal(workflow[4].inputs.ckpt_name, 'sd_xl_turbo_1.0_fp16.safetensors');
  assert.equal(workflow[5].inputs.width, 768);
  assert.equal(workflow[6].inputs.text, 'Un nucleo cosmico');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(requests.length, 3);
});

test('ComfyUI resta confinato al loopback', () => {
  const remote = new ImageGenerationService({ endpoint: 'https://images.example/', model: 'model.safetensors', protocol: 'comfyui', apiKey: 'ignored' });
  assert.equal(remote.available, false);
  const workflow = buildComfyWorkflow({ prompt: 'Nebulosa', size: '512x512', model: 'model.safetensors', seed: 42 });
  assert.equal(workflow[3].inputs.seed, 42);
  assert.equal(workflow[5].inputs.height, 512);
});

test('ComfyUI elimina soltanto il proprio output locale dopo averlo letto', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-image-output-'));
  const generated = path.join(root, 'nexus.png');
  fs.writeFileSync(generated, png);
  const service = new ImageGenerationService({
    endpoint: 'http://127.0.0.1:8188/', model: 'model.safetensors', protocol: 'comfyui', outputRoot: root,
    sleep: async () => {},
    fetchImpl: async (url) => {
      if (url.endsWith('/prompt')) return { ok: true, json: async () => ({ prompt_id: 'job-1' }) };
      if (url.endsWith('/history/job-1')) return { ok: true, json: async () => ({ 'job-1': { status: { completed: true }, outputs: { 9: { images: [{ filename: 'nexus.png', subfolder: '', type: 'output' }] } } } }) };
      return { ok: true, arrayBuffer: async () => png };
    }
  });
  try {
    await service.generate({ prompt: 'Nucleo', size: '512x512' });
    assert.equal(fs.existsSync(generated), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
