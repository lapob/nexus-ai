/**
 * @module tests/web-barge-in
 * @description Interruzione vocale: soglia adattiva al fondo, avvio protetto, pause tollerate, niente falsi allarmi.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../web/src/barge-in.ts');

/** Simula un microfono campionato ogni 40 ms: `level(t)` restituisce l'RMS al tempo t. */
function run(detector, level, durationMs) {
  for (let t = 0; t <= durationMs; t += 40) if (detector.push(level(t), t)) return t;
  return null;
}

test('stanza silenziosa: una voce normale interrompe in circa 300 ms', async () => {
  const { createBargeInDetector } = await load();
  const detector = createBargeInDetector();
  const fired = run(detector, (t) => (t < 1000 ? 0.004 : 0.06), 2500);
  assert.ok(fired !== null, 'la voce deve interrompere');
  assert.ok(fired >= 1280 && fired <= 1400, `interruzione a ${fired} ms`);
});

test('nessun falso allarme: eco residua, rumore costante e un colpo isolato', async () => {
  const { createBargeInDetector } = await load();
  // Fondo rumoroso (ventola, eco) a 0.03: la soglia sale e il rumore non interrompe.
  const noisy = createBargeInDetector();
  assert.equal(run(noisy, (t) => 0.03 + 0.004 * Math.sin(t / 30), 5000), null);
  assert.ok(noisy.threshold() > 0.08, `soglia ${noisy.threshold()}`);
  // Un colpo di 120 ms (tasto, tosse breve) non basta.
  const click = createBargeInDetector();
  assert.equal(run(click, (t) => (t >= 1000 && t < 1120 ? 0.3 : 0.005), 3000), null);
});

test('avvio protetto: un picco all\'inizio della voce non interrompe', async () => {
  const { createBargeInDetector } = await load();
  const detector = createBargeInDetector();
  assert.equal(run(detector, (t) => (t < 120 ? 0.2 : 0.004), 2000), null);
  // L'eco iniziale non alza la soglia: subito dopo, una voce normale interrompe ancora.
  assert.ok(detector.threshold() < 0.04, `soglia ${detector.threshold()}`);
  const after = createBargeInDetector();
  assert.ok(run(after, (t) => (t < 120 ? 0.2 : t < 500 ? 0.004 : 0.06), 1500) !== null);
});

test('le brevi pause fra le sillabe non azzerano il parlato; una pausa lunga sì', async () => {
  const { createBargeInDetector } = await load();
  // Sillabe: 80 ms di voce e 80 ms di pausa, ripetute.
  const syllables = createBargeInDetector();
  assert.ok(run(syllables, (t) => (t < 600 ? 0.004 : (Math.floor((t - 600) / 80) % 2 === 0 ? 0.07 : 0.01)), 3000) !== null);
  // Due parole isolate da 200 ms separate da 600 ms di silenzio non bastano.
  const words = createBargeInDetector();
  assert.equal(run(words, (t) => ((t >= 600 && t < 800) || (t >= 1400 && t < 1600) ? 0.07 : 0.004), 3000), null);
});

test('valori non validi del microfono sono trattati come silenzio', async () => {
  const { createBargeInDetector } = await load();
  const detector = createBargeInDetector();
  assert.equal(run(detector, () => Number.NaN, 2000), null);
  assert.equal(detector.threshold(), 0.03);
});
