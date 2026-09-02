/**
 * @module scripts/sync-brand-assets
 * @description Mantiene un'unica sorgente raster del marchio pubblico NexusNXS.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workspace = path.resolve(root, '..');
const configPath = path.join(root, 'config', 'brand-assets.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function insideWorkspace(candidate) {
  const relative = path.relative(workspace, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveAsset(relative) {
  const candidate = path.resolve(root, String(relative));
  if (!insideWorkspace(candidate)) throw new Error(`Asset fuori dal workspace: ${relative}`);
  return candidate;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.subarray(1, 4).toString('ascii') !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function run({ checkOnly = false } = {}) {
  const canonicalPath = resolveAsset(config.canonical);
  const canonical = fs.readFileSync(canonicalPath);
  const canonicalHash = sha256(canonical);
  const failures = [];

  for (const relative of config.exactCopies) {
    const destination = resolveAsset(relative);
    if (!checkOnly) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(canonicalPath, destination);
    }
    if (!fs.existsSync(destination)) failures.push(`${relative}: mancante`);
    else if (sha256(fs.readFileSync(destination)) !== canonicalHash) failures.push(`${relative}: non sincronizzato`);
  }

  for (const variant of config.platformVariants || []) {
    const candidate = resolveAsset(variant.path);
    if (!fs.existsSync(candidate)) {
      failures.push(`${variant.path}: variante mancante`);
      continue;
    }
    if (variant.width || variant.height) {
      const dimensions = pngDimensions(fs.readFileSync(candidate));
      if (!dimensions || dimensions.width !== variant.width || dimensions.height !== variant.height) {
        failures.push(`${variant.path}: dimensioni non conformi`);
      }
    }
  }

  const gatewaySource = fs.readFileSync(path.join(root, 'src', 'remote', 'remote-session-gateway.js'), 'utf8');
  if (!gatewaySource.includes("../../build/icon.png")) failures.push('NexusNXS AI pubblica non usa build/icon.png');

  if (failures.length) {
    console.error(`Marchio NexusNXS non conforme:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`${checkOnly ? 'Marchio verificato' : 'Marchio sincronizzato'}: ${canonicalHash}`);
  }
  return { canonicalHash, failures };
}

if (require.main === module) run({ checkOnly: process.argv.includes('--check') });

module.exports = { insideWorkspace, pngDimensions, run, sha256 };
