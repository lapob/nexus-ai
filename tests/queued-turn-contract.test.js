const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'src/renderer/hooks/useNexusController.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const composer = fs.readFileSync(path.join(root, 'src/renderer/components/CommandInput.tsx'), 'utf8');

test('la coda conserva modalità e allegati senza interrompere lo stream attivo', () => {
  const queueGuard = controller.indexOf('if (shouldQueueTurn(requestGenerating.current))');
  const speechStop = controller.indexOf('await stopSpeech(false)', queueGuard);
  assert.ok(queueGuard >= 0 && speechStop > queueGuard, 'il controllo coda deve precedere qualsiasi interruzione');
  assert.match(controller, /queuedTurnRef\.current = \{ mode, attachments: \[\.\.\.attachments\] \}/);
  assert.match(controller, /submit\(next, queued\.mode, queued\.attachments\)/);
});

test('la transizione accodata si chiude su start, errore e cambio conversazione', () => {
  assert.match(controller, /if \(event\.type === 'start'\)[\s\S]*?advancingQueuedTurn\.current = false/);
  assert.match(controller, /event\.type === 'error'[\s\S]*?if \(advancingQueuedTurn\.current\)/);
  assert.ok((controller.match(/queuedTurnRef\.current = \{ mode: 'fast', attachments: \[\] \}/g) || []).length >= 5);
});

test('composer e shell espongono chiaramente il turno successivo', () => {
  assert.match(app, /data-next-turn=.*queuedVoicePrompt/);
  assert.match(app, /queueing=\{nexus\.generating\}/);
  assert.match(composer, /Scrivi il prossimo messaggio/);
  assert.match(composer, /Invio · metti in coda/);
});
