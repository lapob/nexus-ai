const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const {
  createWakeWordListener,
  normalizeWakeWordConfiguration,
  normalizeWakeLocale,
  wakeWordsForLocale,
  wakeWordPowerShellScript
} = require('../src/infrastructure/windows/wake-word-listener');

test('il richiamo locale resta opt-in e limita soglia, cooldown e grammatica', () => {
  assert.deepEqual(normalizeWakeWordConfiguration(), {
    enabled: false, suspended: false, confidence: 0.84, cooldownMs: 5000,
    locale: 'en-US', phrases: ['Nexus', 'Hey Nexus']
  });
  assert.deepEqual(normalizeWakeWordConfiguration({
    wakeWordEnabled: true, wakeWordConfidence: 9, wakeWordCooldownMs: 1, wakeWordLocale: 'it_IT'
  }), {
    enabled: true, suspended: false, confidence: 0.95, cooldownMs: 2000,
    locale: 'it-IT', phrases: ['Nexus', 'Ehi Nexus']
  });
  const script = wakeWordPowerShellScript({ wakeWordConfidence: 0.9, wakeWordCooldownMs: 10000, wakeWordLocale: 'it-IT' });
  assert.match(script, /'Nexus', 'Ehi Nexus'/);
  assert.match(script, /\$threshold = \[double\]0\.900/);
  assert.match(script, /\$cooldown = \[int\]10000/);
  assert.match(script, /InstalledRecognizers/);
  assert.match(script, /EndSilenceTimeout/);
  assert.doesNotMatch(script, /https?:|Invoke-WebRequest|WebClient|curl/i);
});

test('il richiamo segue la lingua del dispositivo senza aprire una grammatica libera', () => {
  assert.equal(normalizeWakeLocale('PT_br'), 'pt-BR');
  assert.equal(normalizeWakeLocale('invalid locale'), 'en-US');
  assert.deepEqual(wakeWordsForLocale('es-ES'), ['Nexus', 'Hola Nexus', 'Oye Nexus']);
  assert.deepEqual(wakeWordsForLocale('ja-JP'), ['Nexus', 'Hey Nexus']);
});

test('il processo SAPI comunica solo eventi allowlist e termina pulito', async () => {
  let process;
  const wakes = [];
  const listening = [];
  const listener = createWakeWordListener({
    platform: 'win32',
    stopTimeoutMs: 100,
    launch: (_file, args, options) => {
      process = new EventEmitter();
      process.stdin = new PassThrough();
      process.stdout = new PassThrough();
      process.kill = () => process.emit('close', 0);
      process.stdin.once('finish', () => process.emit('close', 0));
      assert.equal(options.windowsHide, true);
      assert.equal(args.includes('-EncodedCommand'), true);
      return process;
    },
    onWake: (event) => wakes.push(event),
    onListeningChange: (active) => listening.push(active)
  });
  await listener.configure({ wakeWordEnabled: true, wakeWordLocale: 'en-US' });
  process.stdout.write('{"type":"ready"}\n');
  process.stdout.write('{"type":"wake","phrase":"Hey Nexus","confidence":0.91}\n');
  process.stdout.write('{"type":"wake","phrase":"anything else","confidence":1}\n');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(listener.status().listening, true);
  assert.equal(wakes.length, 1);
  assert.equal(wakes[0].phrase, 'Hey Nexus');
  await listener.stop();
  assert.equal(listener.status().listening, false);
  assert.deepEqual(listening, [true, false]);
});

test('su piattaforme non Windows il listener non apre processi', async () => {
  let launches = 0;
  const listener = createWakeWordListener({ platform: 'linux', launch: () => { launches += 1; } });
  await listener.configure({ wakeWordEnabled: true });
  assert.equal(launches, 0);
  assert.equal(listener.status().available, false);
});

test('la UI unica espone il richiamo soltanto come opt-in visibile e lo sospende mentre ascolta o parla', () => {
  const root = path.resolve(__dirname, '..');
  const presence = fs.readFileSync(path.join(root, 'web/src/desktopPresence.ts'), 'utf8');
  const control = fs.readFileSync(path.join(root, 'web/src/ControlCenter.tsx'), 'utf8');
  assert.match(presence, /localStorage\.getItem\(WAKE_WORD_KEY\) === 'on'/, 'spento finché non viene attivato');
  assert.match(presence, /onWakeWordActivation/);
  assert.match(presence, /wakeWordSuspended: live \|\| state === 'listening' \|\| state === 'speaking'/);
  assert.match(control, /Parola di attivazione «Nexus»/);
  assert.match(control, /Il riconoscimento è locale/);
});
