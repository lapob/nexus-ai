const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  arithmeticAnswerValid,
  deterministicArithmeticReply,
  percentageAggregateSolution,
  percentageSequenceSolution,
  simpleArithmeticSolution
} = require('../src/application/simple-arithmetic');

test('interpreta per come moltiplicazione nel caso italiano osservato', () => {
  const question = 'Rispondi in italiano con una sola frase: qual è il risultato di 17 per 6?';
  assert.deepEqual(simpleArithmeticSolution(question), {
    expression: '17 per 6',
    normalizedExpression: '17*6',
    value: 102,
    formatted: '102',
    language: 'it'
  });
  assert.equal(deterministicArithmeticReply(question), 'Il risultato è 102.');
  assert.equal(arithmeticAnswerValid(question, 'Il risultato è 102.'), true);
  assert.equal(arithmeticAnswerValid(question, 'Il risultato è circa 2,83.'), false);
});

test('supporta operatori italiani e inglesi con precedenza deterministica', () => {
  assert.equal(simpleArithmeticSolution('Quanto fa 2 più 3 per 4?').value, 14);
  assert.equal(simpleArithmeticSolution('Calcola 20 diviso per 5.').value, 4);
  assert.equal(simpleArithmeticSolution('Calcola e dimmi qual è il risultato di 9 moltiplicato per 7.').value, 63);
  assert.equal(simpleArithmeticSolution('Rispondi solo con il numero: calcola 7 meno 12.').value, -5);
  assert.equal(simpleArithmeticSolution('What is 17 times 6?').value, 102);
  assert.equal(simpleArithmeticSolution('Compute 20 divided by 5.').value, 4);
  assert.equal(deterministicArithmeticReply('Only the number: what is 7 plus 8?'), '15');
  assert.equal(deterministicArithmeticReply('Quanto fa 17 per 23? Rispondi soltanto con il risultato.'), '391');
  assert.equal(deterministicArithmeticReply('What is 17 times 23? Reply only with the result.'), '391');
});

test('gestisce potenze senza eval e con precedenza matematica', () => {
  assert.equal(simpleArithmeticSolution('Qual è il risultato di 2 elevato a 10?').value, 1024);
  assert.equal(simpleArithmeticSolution('What is 2 to the power of 3?').value, 8);
  assert.equal(simpleArithmeticSolution('What is -2 ^ 2?').value, -4);
  assert.equal(simpleArithmeticSolution('What is 2 ^ -2?').value, 0.25);
});

test('non intercetta testo, codice, domande con più espressioni o richieste di spiegazione', () => {
  assert.equal(simpleArithmeticSolution('Ho lavorato 17 per 6 persone.'), null);
  assert.equal(simpleArithmeticSolution('Qual è il risultato del sondaggio tra 17 per 6 persone?'), null);
  assert.equal(simpleArithmeticSolution('Qual è il risultato di questo codice JavaScript: 17 * 6?'), null);
  assert.equal(simpleArithmeticSolution('Calcola 2 + 2 e 3 + 3.'), null);
  assert.equal(deterministicArithmeticReply('Spiega passo passo: qual è il risultato di 17 per 6?'), null);
});

test('risponde ai calcoli elementari con una spiegazione breve deterministica', () => {
  assert.equal(
    deterministicArithmeticReply('Calculate 17*23 and explain briefly'),
    'The calculation is 17 × 23 = 391.'
  );
  assert.equal(
    deterministicArithmeticReply('Calcola 17 per 23 e spiega brevemente'),
    'Il calcolo è 17 × 23 = 391.'
  );
});

test('non restituisce un risultato parziale quando la catena supera il limite sicuro', () => {
  assert.equal(deterministicArithmeticReply('Calcola 1+1+1+1+1+1+1+1+1'), null);
  assert.equal(simpleArithmeticSolution('1+1+1+1+1+1+1+1+1'), null);
});

test('risolve in locale variazioni percentuali sequenziali esplicite senza promuoverle al modello profondo', () => {
  const question = 'Un servizio elabora 240 richieste al minuto. Un’ottimizzazione aumenta la capacità del 25%, poi il 10% delle richieste fallisce e non conta. Quante richieste riuscite al minuto restano? Rispondi solo con numero e unità.';
  assert.deepEqual(percentageSequenceSolution(question), {
    value: 270,
    formatted: '270',
    language: 'it',
    unit: 'richieste al minuto'
  });
  assert.equal(deterministicArithmeticReply(question), '270 richieste al minuto');
  assert.equal(
    deterministicArithmeticReply('Un servizio gestisce 240 richieste/minuto, aumenta del 25%, poi il 10% delle richieste fallisce. Rispondi solo con numero e unità.'),
    '270 richieste/minuto'
  );
  assert.equal(
    deterministicArithmeticReply('100 users increase by 20%, then decrease by 10%. Answer only with the number.'),
    '108'
  );
  assert.equal(
    deterministicArithmeticReply('100 euro si riducono del 20%, poi aumentano del 10%. Rispondi solo con il numero.'),
    '88'
  );
  assert.equal(deterministicArithmeticReply('Spiega passo passo: 240 richieste aumentano del 25% e poi diminuiscono del 10%.'), null);
  assert.equal(deterministicArithmeticReply('Il dato è 240 richieste e compare anche 25%, senza indicare il tipo di variazione.'), null);
});

test('calcola un totale aggregato con una sola variazione percentuale esplicita', () => {
  const question = "Quattro file pesano 12 MB ciascuno. Ogni file viene ridotto del 25%. Rispondi soltanto con il totale finale e l'unità.";
  assert.deepEqual(percentageAggregateSolution(question), {
    value: 36,
    formatted: '36',
    language: 'it',
    unit: 'MB'
  });
  assert.equal(deterministicArithmeticReply(question), '36 MB');
  assert.equal(percentageAggregateSolution('Quattro file pesano 12 MB ciascuno e cambiano del 25%.'), null);
  assert.equal(percentageAggregateSolution('Quattro file pesano 12 MB ciascuno, diminuiscono del 25% e poi del 10%.'), null);
});

test('il percorso desktop e guest applica il fast path prima del modello', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'application', 'register-ipc.js'), 'utf8');
  assert.match(source, /deterministicArithmeticReply\(question\)/u);
  assert.match(source, /deterministicArithmeticReply\(parsed\.question\)/u);
});
