/**
 * @module scripts/verify-local-image-generation
 * @description Prova end-to-end del generatore immagini locale NexusNXS.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ImageGenerationService } = require('../src/ai/image-generation-service');

// #region 01 - Configurazione e validazione artefatto

const projectRoot = path.resolve(__dirname, '..');
const runtime = JSON.parse(fs.readFileSync(path.join(projectRoot, 'config', 'local-image-runtime.json'), 'utf8'));
const outputPath = path.join(projectRoot, 'qa-artifacts', 'local-image-verification.png');

function pngDimensions(image) {
  if (image.length < 24 || image.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('Il risultato non contiene un header PNG valido.');
  }
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

// #endregion
// #region 02 - Prova reale

async function main() {
const service = new ImageGenerationService({
    endpoint: runtime.endpoint,
    model: runtime.model.name,
    protocol: runtime.provider,
    outputRoot: path.join(path.dirname(projectRoot), '.services', 'comfyui', 'app', 'output'),
    timeoutMs: runtime.timeoutMs
  });
  if (!service.available) throw new Error('Il generatore immagini locale non risulta disponibile.');
  const startedAt = Date.now();
  const result = await service.generate({
    prompt: 'A premium teal cosmic neural core, dark space, subtle particles, elegant cinematic lighting, no text',
    size: '512x512'
  });
  const dimensions = pngDimensions(result.image);
  if (dimensions.width !== 512 || dimensions.height !== 512) {
    throw new Error(`Dimensioni inattese: ${dimensions.width}x${dimensions.height}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result.image, { mode: 0o600 });
  console.log(`Immagine locale verificata: ${dimensions.width}x${dimensions.height}, ${result.image.length} byte, ${Date.now() - startedAt} ms.`);
  console.log(outputPath);
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { main, pngDimensions };

// #endregion
