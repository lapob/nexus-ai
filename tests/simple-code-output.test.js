const test = require('node:test');
const assert = require('node:assert/strict');
const { deterministicCodeOutputReply } = require('../src/application/simple-code-output');

test('calcola output map e join senza avviare un modello o eseguire codice', () => {
  assert.equal(deterministicCodeOutputReply(
    'Trova il risultato di questo JavaScript: const x=[1,2,3].map(n=>n*2); console.log(x.join(",")); Rispondi solo con output.'
  ), '2,4,6');
  assert.equal(deterministicCodeOutputReply(
    "Quale output stampa JavaScript? const valori = [-2, 0.5].map(item => item + 3); console.log(valori.join(' | '));"
  ), '1 | 3.5');
});

test('rifiuta sintassi arbitraria, effetti collaterali e calcoli non finiti', () => {
  assert.equal(deterministicCodeOutputReply('Spiega const x=[1,2].map(n=>n*2).'), null);
  assert.equal(deterministicCodeOutputReply('Output JavaScript: const x=[1].map(n=>process.exit()); console.log(x.join(","));'), null);
  assert.equal(deterministicCodeOutputReply('Output JavaScript: const x=[1].map(n=>n/0); console.log(x.join(","));'), null);
  assert.equal(deterministicCodeOutputReply('Output JavaScript: const x=[1].map(n=>n*2); console.log(y.join(","));'), null);
});

test('propone conversione e validazione deterministiche per stringhe numeriche con unità', () => {
  const answer = deterministicCodeOutputReply(
    "La stringa '12px' moltiplicata per 2 produce NaN. Proponi in una frase una correzione JavaScript che validi davvero il risultato."
  );
  assert.match(answer, /parseFloat\('12px'\)/u);
  assert.match(answer, /Number\.isFinite/u);
  assert.equal(deterministicCodeOutputReply("La stringa 'dato' va corretta in JavaScript."), null);
});

test('il fast path desktop e remoto usa il risolutore deterministico confinato', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'application', 'register-ipc.js'), 'utf8');
  assert.match(source, /deterministicCodeOutputReply/);
  assert.equal((source.match(/deterministicCodeOutputReply\((?:question|parsed\.question)\)/g) || []).length, 3);
  assert.doesNotMatch(require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'application', 'simple-code-output.js'), 'utf8'), /\beval\s*\(|new Function|child_process/);
});
