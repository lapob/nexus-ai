/**
 * @module tests/windows-signing
 * @description Modalità di firma dell'installer: Azure Artifact Signing o .pfx, nessuna mezza configurazione.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { windowsSigning, azureSignOptions, validAzureEndpoint, WINDOWS_SIGNING_SECRETS } = require('../scripts/lib/windows-signing');

const azure = {
  NEXUS_AZURE_SIGN_ENDPOINT: 'https://weu.codesigning.azure.net/',
  NEXUS_AZURE_SIGN_ACCOUNT: 'nexusnxs',
  NEXUS_AZURE_SIGN_PROFILE: 'public-trust',
  NEXUS_AZURE_SIGN_PUBLISHER: 'NexusNXS',
  AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's'
};

test('senza configurazione nessuna modalità è pronta', () => {
  assert.deepEqual({ ...windowsSigning({}), missing: [] }, { mode: null, ready: false, missing: [], invalid: [] });
  assert.equal(azureSignOptions({}), null);
});

test('Azure completo produce le opzioni di electron-builder senza segreti', () => {
  assert.equal(windowsSigning(azure).ready, true);
  const options = azureSignOptions(azure);
  assert.equal(options.endpoint, 'https://weu.codesigning.azure.net');
  assert.equal(options.codeSigningAccountName, 'nexusnxs');
  assert.equal(options.certificateProfileName, 'public-trust');
  assert.equal(options.timestampRfc3161, 'http://timestamp.acs.microsoft.com');
  assert.ok(!JSON.stringify(options).includes('"s"'), 'il segreto del client non entra nella configurazione');
});

test('Azure parziale o con endpoint estraneo resta bloccato; .pfx richiede entrambe le variabili', () => {
  const { AZURE_CLIENT_SECRET, ...partial } = azure;
  assert.deepEqual(windowsSigning(partial).missing, ['AZURE_CLIENT_SECRET']);
  assert.equal(windowsSigning({ ...azure, NEXUS_AZURE_SIGN_ENDPOINT: 'https://evil.example.com' }).ready, false);
  assert.equal(validAzureEndpoint('http://weu.codesigning.azure.net'), false);
  assert.equal(validAzureEndpoint('https://eus.codesigning.azure.net'), true);
  assert.deepEqual(windowsSigning({ CSC_LINK: 'cert.pfx' }), { mode: 'pfx', ready: false, missing: ['CSC_KEY_PASSWORD'], invalid: [] });
  assert.equal(windowsSigning({ CSC_LINK: 'cert.pfx', CSC_KEY_PASSWORD: 'x' }).ready, true);
  for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'AZURE_CLIENT_SECRET']) assert.ok(WINDOWS_SIGNING_SECRETS.includes(name));
});
