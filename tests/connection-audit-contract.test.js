const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts/audit-connections.ps1'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'scripts/server-dashboard.ps1'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('audit connessioni separa pubblico, locale, LAN e Tailscale senza contenuti utente', () => {
  assert.match(script, /https:\/\/nexusnxs\.com\//);
  assert.match(script, /https:\/\/ai\.nexusnxs\.com\/readyz/);
  assert.match(script, /Get-NexusListeners/);
  assert.match(script, /Get-ActiveGatewayConnections/);
  assert.match(script, /Get-TailscaleState/);
  assert.match(script, /Get-FirewallState/);
  assert.match(script, /Zone = \$zone/);
  assert.doesNotMatch(script, /promptContent|messageContent|conversationContent|transcriptContent/i);
});

test('package espone audit leggibile e JSON per automazione', () => {
  assert.match(pkg.scripts['connections:audit'], /audit-connections\.ps1/);
  assert.match(pkg.scripts['connections:audit:json'], /-Json/);
  assert.match(pkg.scripts['connections:verify'], /-Strict/);
  assert.match(script, /exit 2/);
});

test('dashboard privata controlla anche sito e ingresso AI pubblico senza interrogare il modello', () => {
  assert.match(dashboard, /Get-PublicIngressHealth/);
  assert.match(dashboard, /https:\/\/nexusnxs\.com\//);
  assert.match(dashboard, /https:\/\/ai\.nexusnxs\.com\/readyz/);
  assert.match(dashboard, /PUBLIC INGRESS/);
  assert.doesNotMatch(dashboard, /\/api\/models|\/api\/guest\/messages/);
});
