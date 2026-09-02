const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Il modulo è intenzionalmente puro; per il test Node estraiamo le formule
// TypeScript senza introdurre un secondo transpiler nel runtime di produzione.
const source = fs.readFileSync(require.resolve('../src/renderer/systems/AudioEnvelope.ts'), 'utf8')
  .replace(/export function /g, 'function ')
  .replace(/: Float32Array/g, '')
  .replace(/: number\[\]/g, '')
  .replace(/: number/g, '');
const factory = new Function(`${source}\nreturn { normalizedVoiceLevel, smoothVoiceLevel, trimVoiceSignal };`);
const { normalizedVoiceLevel, smoothVoiceLevel, trimVoiceSignal } = factory();

test('la risposta al volume è progressiva dalla voce bassa a quella forte', () => {
  const levels = [0.023, 0.03, 0.05, 0.08, 0.14, 0.22].map((rms) => normalizedVoiceLevel(rms, 0.018, 1));
  for (let index = 1; index < levels.length; index += 1) assert.ok(levels[index] > levels[index - 1]);
  assert.ok(levels[1] > 0.05, 'la voce bassa deve restare visibile');
  assert.ok(levels[3] < 0.7, 'una voce media non deve saturare');
  assert.ok(levels.at(-1) <= 0.9);
  assert.ok(normalizedVoiceLevel(0.022, 0.018, 1) < 0.02, 'il rumore vicino alla soglia non deve animare la scena');
});

test('attacco e rilascio non producono salti istantanei', () => {
  const attack = smoothVoiceLevel(0.1, 0.9);
  const release = smoothVoiceLevel(0.9, 0.1);
  assert.ok(attack > 0.1 && attack < 0.25);
  assert.ok(release > 0.75 && release < 0.9);
});

test('ritaglia il silenzio mantenendo margine prima e dopo la voce', () => {
  const rate = 16_000;
  const input = new Float32Array(rate * 3);
  for (let index = rate; index < rate * 2; index += 1) input[index] = Math.sin(index * 0.04) * 0.08;
  const trimmed = trimVoiceSignal(input, rate);
  assert.ok(trimmed.length > rate, 'deve mantenere padding attorno alla voce');
  assert.ok(trimmed.length < input.length, 'deve rimuovere il silenzio esterno');
});
