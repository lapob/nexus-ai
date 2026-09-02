const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'electron') return { app: {}, BrowserWindow: class {}, ipcMain: {}, screen: {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { ambientPresenceBounds, automaticPresenceDisplayId, normalizePresenceConfiguration, presenceTransitionDelay, serializeDisplayPosition, systemPresenceBounds, systemPresenceDocument } = require('../src/infrastructure/electron/companion-window');
Module._load = originalLoad;

test('la Presence mantiene coordinate relative sicure su display diversi', () => {
  const left = { id: 7, workArea: { x: -2560, y: -120, width: 2560, height: 1440 } };
  assert.deepEqual(systemPresenceBounds(left), { x: -186, y: 1134, width: 168, height: 168 });
  const position = serializeDisplayPosition({ x: -1800, y: 420, width: 168, height: 168 }, left);
  const scaled = { id: 7, workArea: { x: -1920, y: 0, width: 1920, height: 1080 } };
  const restored = systemPresenceBounds(scaled, position);
  assert.ok(restored.x >= scaled.workArea.x + 18);
  assert.ok(restored.x + restored.width <= scaled.workArea.x + scaled.workArea.width - 18);
});

test('la Presence automatica sceglie il secondo display solo nelle configurazioni a due monitor', () => {
  assert.equal(automaticPresenceDisplayId([{ logicalId: 'primary' }]), 'primary');
  assert.equal(automaticPresenceDisplayId([{ logicalId: 'primary' }, { logicalId: 'display-2' }]), 'display-2');
  assert.equal(automaticPresenceDisplayId([
    { logicalId: 'primary' }, { logicalId: 'display-2' }, { logicalId: 'display-3' }
  ]), 'primary');
  assert.equal(automaticPresenceDisplayId([]), 'primary');
});

test('gli stati vocali possono materializzare la Presence al centro senza perdere la posizione idle', () => {
  assert.deepEqual(ambientPresenceBounds({ workArea: { x: -1920, y: 0, width: 1920, height: 1080 } }), {
    x: -1044, y: 456, width: 168, height: 168
  });
});

test('la Presence usa solo i tre visualizer, CSS leggero e un hotspot esplicito', () => {
  const document = systemPresenceDocument({ interactive: true, locale: 'it-IT', configuration: { appearance: 'jarvis-reactor', state: 'listening', motion: 'full' } });
  assert.match(document, /data-appearance="jarvis-reactor"/);
  assert.match(document, /data-state="listening"/);
  assert.match(document, /aria-label="Apri NexusNXS"/);
  assert.match(document, /class="visual neural"/);
  assert.match(document, /class="visual saturn"/);
  assert.match(document, /class="visual reactor"/);
  assert.match(document, /prefers-reduced-motion/);
  assert.doesNotMatch(document, /canvas|webgl|three|nexus-pet/i);
});

test('la configurazione elimina i campi pet legacy e applica fallback sicuri', () => {
  assert.deepEqual(normalizePresenceConfiguration({ state: 'thinking', appearance: 'neural', motion: 'reduced', quality: 'efficient', pet: 'nova' }), {
    state: 'thinking', appearance: 'neural', motion: 'reduced', quality: 'efficient',
    wakeWordEnabled: false, wakeWordConfidence: 0.84, wakeWordCooldownMs: 5000,
    wakeWordSuspended: false, wakeWordListening: false
  });
  assert.equal(normalizePresenceConfiguration({ appearance: 'unknown' }).appearance, 'saturn-experimental');
});

test('le transizioni Presence preservano gli stati critici e assestano idle', () => {
  assert.equal(presenceTransitionDelay('thinking', 'permission'), 0);
  assert.equal(presenceTransitionDelay('idle', 'listening'), 0);
  assert.equal(presenceTransitionDelay('error', 'idle'), 420);
  assert.equal(presenceTransitionDelay('executing', 'responding'), 140);
  assert.equal(presenceTransitionDelay('thinking', 'thinking'), 0);
});

test('il manager usa una sola Presence selezionabile, trascinabile e sospesa con la UI', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/infrastructure/electron/companion-window.js'), 'utf8');
  assert.match(source, /const presenceWindows = new Map\(\)/);
  assert.match(source, /screen\.on\('display-added', handleDisplayChange\)/);
  assert.match(source, /setIgnoreMouseEvents\(true, \{ forward: true \}\)/);
  assert.match(source, /movable: true, alwaysOnTop: true/);
  assert.match(source, /setVisibleOnAllWorkspaces\(true, \{ visibleOnFullScreen: true \}\)/);
  assert.match(source, /if \(applicationVisible\)[\s\S]*entry\.window\.hide\(\)/);
  assert.match(source, /setApplicationVisible/);
  assert.match(source, /selectSystemPresenceDisplay/);
  assert.match(source, /displaySelectionMode/);
  assert.match(source, /automaticPresenceDisplayId/);
  assert.match(source, /AMBIENT_CENTER_STATES/);
  assert.match(source, /entry\.ambientCentered/);
  assert.match(source, /const selectedDescriptor = descriptors\.find/);
  assert.match(source, /const activeIds = new Set\(selectedDescriptor \? \[selectedDescriptor\.displayId\] : \[\]\)/);
  assert.match(source, /Posizioni Presence obsolete non ripulite/);
  assert.match(source, /'open-full-app', 'close-full-app', 'open-chatgpt', 'close-chatgpt'/);
});
