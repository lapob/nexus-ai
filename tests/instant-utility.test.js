const test = require('node:test');
const assert = require('node:assert/strict');
const { deterministicUtilityReply } = require('../src/application/instant-utility');

const instant = new Date(2026, 7, 27, 14, 5, 0);

test('answers exact Italian time and date requests locally', () => {
  assert.equal(deterministicUtilityReply('Che ore sono?', instant), 'Sono le 14:05.');
  assert.match(deterministicUtilityReply('Che giorno è?', instant), /^Oggi è giovedì 27 agosto 2026\.$/u);
});

test('answers exact English time requests and rejects broader questions', () => {
  assert.match(deterministicUtilityReply('What time is it?', instant), /^It is 02:05 PM\.$/u);
  assert.equal(deterministicUtilityReply('Spiegami come funziona un orologio', instant), null);
  assert.equal(deterministicUtilityReply('Che ore sono a Tokyo?', instant), null);
});

test('converts common units locally without interpreting unrelated numbers', () => {
  assert.equal(deterministicUtilityReply('Converti 10 km in miglia', instant), '6,213712 mi.');
  assert.equal(deterministicUtilityReply('Convert 32 F to Celsius', instant), '0 °C.');
  assert.equal(deterministicUtilityReply('Converti 5 kg in chilometri', instant), null);
  assert.equal(deterministicUtilityReply('Parlami di 10 km di strada', instant), null);
});
