/**
 * @module scripts/check-signing-readiness
 * @description Diagnostica firma Windows, Android e manifest senza mostrare segreti.
 */
const fs = require('node:fs');
const path = require('node:path');

const strict = process.argv.includes('--strict');
const json = process.argv.includes('--json');
const env = process.env;

function configured(name) {
  return Boolean(String(env[name] || '').trim());
}

function localFileStatus(name, { allowInline = false } = {}) {
  const value = String(env[name] || '').trim();
  if (!value) return { configured: false, valid: false };
  if (/^(https?:|data:)/i.test(value) || value.includes('BEGIN ') || (allowInline && value.length > 256)) return { configured: true, valid: true };
  const candidate = path.resolve(value);
  return { configured: true, valid: fs.existsSync(candidate) && fs.statSync(candidate).isFile() };
}

const groups = {
  windows: {
    ready: configured('CSC_KEY_PASSWORD') && localFileStatus('CSC_LINK', { allowInline: true }).valid,
    missing: ['CSC_LINK', 'CSC_KEY_PASSWORD'].filter((name) => !configured(name))
  },
  android: {
    ready: localFileStatus('NEXUS_ANDROID_KEYSTORE').valid
      && ['NEXUS_ANDROID_STORE_PASSWORD', 'NEXUS_ANDROID_KEY_ALIAS', 'NEXUS_ANDROID_KEY_PASSWORD'].every(configured),
    missing: ['NEXUS_ANDROID_KEYSTORE', 'NEXUS_ANDROID_STORE_PASSWORD', 'NEXUS_ANDROID_KEY_ALIAS', 'NEXUS_ANDROID_KEY_PASSWORD'].filter((name) => !configured(name))
  },
  updateManifest: {
    ready: ['NEXUS_RELEASE_MANIFEST_PRIVATE_KEY', 'NEXUS_RELEASE_MANIFEST_PUBLIC_KEY', 'NEXUS_RELEASE_MANIFEST_KEY_ID'].every(configured),
    missing: ['NEXUS_RELEASE_MANIFEST_PRIVATE_KEY', 'NEXUS_RELEASE_MANIFEST_PUBLIC_KEY', 'NEXUS_RELEASE_MANIFEST_KEY_ID'].filter((name) => !configured(name))
  },
  updates: {
    ready: /^https:\/\//i.test(String(env.NEXUS_UPDATE_URL || '').trim()),
    missing: configured('NEXUS_UPDATE_URL') ? [] : ['NEXUS_UPDATE_URL']
  }
};

const ready = Object.values(groups).every((group) => group.ready);
const report = { ready, groups };
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log('Firma NexusNXS:');
  for (const [name, group] of Object.entries(groups)) {
    console.log(`- ${name}: ${group.ready ? 'pronta' : `da configurare (${group.missing.join(', ') || 'valore non valido'})`}`);
  }
}
if (strict && !ready) process.exitCode = 1;

module.exports = { configured, localFileStatus };
