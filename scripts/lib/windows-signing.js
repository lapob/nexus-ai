/**
 * @module scripts/lib/windows-signing
 * @description Modalità di firma Authenticode dell'installer Windows, senza mai leggere o stampare i segreti:
 * - «azure»: Azure Artifact Signing (ex Trusted Signing), certificato gestito da Microsoft, nessun file .pfx sul PC;
 *   credenziali Entra ID nelle variabili standard AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET.
 * - «pfx»: certificato OV/EV esportabile, tramite CSC_LINK e CSC_KEY_PASSWORD (electron-builder).
 */
const AZURE_CONFIG = ['NEXUS_AZURE_SIGN_ENDPOINT', 'NEXUS_AZURE_SIGN_ACCOUNT', 'NEXUS_AZURE_SIGN_PROFILE', 'NEXUS_AZURE_SIGN_PUBLISHER'];
const AZURE_SECRETS = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];
const PFX_SECRETS = ['CSC_LINK', 'CSC_KEY_PASSWORD'];
/** Tutte le variabili sensibili della firma Windows: vanno passate solo al passo di build firmato. */
const WINDOWS_SIGNING_SECRETS = [...PFX_SECRETS, ...AZURE_SECRETS];

const set = (env, name) => Boolean(String(env[name] || '').trim());

/** Endpoint regionali ufficiali del servizio: niente URL arbitrari. */
function validAzureEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /^[a-z0-9-]+\.codesigning\.azure\.net$/i.test(url.hostname) && (url.pathname === '/' || url.pathname === '');
  } catch { return false; }
}

/** @returns {{ mode: 'azure'|'pfx'|null, ready: boolean, missing: string[], invalid: string[] }} */
function windowsSigning(env = process.env) {
  const azureWanted = AZURE_CONFIG.some((name) => set(env, name));
  if (azureWanted) {
    const missing = [...AZURE_CONFIG, ...AZURE_SECRETS].filter((name) => !set(env, name));
    const invalid = set(env, 'NEXUS_AZURE_SIGN_ENDPOINT') && !validAzureEndpoint(env.NEXUS_AZURE_SIGN_ENDPOINT) ? ['NEXUS_AZURE_SIGN_ENDPOINT'] : [];
    return { mode: 'azure', ready: !missing.length && !invalid.length, missing, invalid };
  }
  if (set(env, 'CSC_LINK') || set(env, 'CSC_KEY_PASSWORD')) {
    const missing = PFX_SECRETS.filter((name) => !set(env, name));
    return { mode: 'pfx', ready: !missing.length, missing, invalid: [] };
  }
  return { mode: null, ready: false, missing: ['CSC_LINK + CSC_KEY_PASSWORD oppure NEXUS_AZURE_SIGN_*'], invalid: [] };
}

/** Opzioni electron-builder (win.azureSignOptions) per la modalità Azure; null altrimenti. */
function azureSignOptions(env = process.env) {
  const status = windowsSigning(env);
  if (status.mode !== 'azure' || !status.ready) return null;
  return {
    publisherName: String(env.NEXUS_AZURE_SIGN_PUBLISHER).trim(),
    endpoint: String(env.NEXUS_AZURE_SIGN_ENDPOINT).trim().replace(/\/$/, ''),
    codeSigningAccountName: String(env.NEXUS_AZURE_SIGN_ACCOUNT).trim(),
    certificateProfileName: String(env.NEXUS_AZURE_SIGN_PROFILE).trim(),
    fileDigest: 'SHA256',
    timestampRfc3161: 'http://timestamp.acs.microsoft.com',
    timestampDigest: 'SHA256'
  };
}

module.exports = { WINDOWS_SIGNING_SECRETS, AZURE_CONFIG, AZURE_SECRETS, PFX_SECRETS, validAzureEndpoint, windowsSigning, azureSignOptions };
