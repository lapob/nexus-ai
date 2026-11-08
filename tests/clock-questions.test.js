const test = require('node:test');
const assert = require('node:assert/strict');
const { webResearchPolicy, isClockQuestion } = require('../src/research/research-policy');
const { deterministicUtilityReply } = require('../src/application/instant-utility');

const NOW = new Date('2026-11-07T09:15:00+01:00');

test('domande sull’orologio non richiedono il web', () => {
  for (const question of [
    'Che giorno è oggi?', 'Rispondi in una frase: che giorno è oggi?', 'Che ore sono adesso?',
    'Quanti giorni mancano a Natale?', 'Che giorno della settimana è oggi?', 'What day is today?'
  ]) {
    assert.equal(isClockQuestion(question), true, question);
    assert.equal(webResearchPolicy({ question }).level, 'none', question);
  }
});

test('notizie, meteo e fatti pubblici di oggi richiedono ancora fonti aggiornate', () => {
  for (const question of ['Che tempo fa oggi a Roma?', 'Notizie di oggi sull’economia', 'Che giorno è oggi lo sciopero dei treni?', 'Qual è il prezzo attuale del bitcoin?', 'Cerca online che giorno è la finale']) {
    assert.equal(webResearchPolicy({ question }).level, 'required', question);
  }
});

test('risposta istantanea dall’orologio anche con una breve istruzione di forma', () => {
  assert.match(deterministicUtilityReply('Che giorno è oggi?', NOW), /^Oggi è sabato 7 novembre 2026\.$/);
  assert.match(deterministicUtilityReply('Rispondi in una frase: che giorno è oggi?', NOW), /sabato 7 novembre 2026/);
  assert.match(deterministicUtilityReply('Qual è la data di oggi?', NOW), /7 novembre 2026/);
  assert.match(deterministicUtilityReply('What day is today?', NOW), /Saturday, November 7, 2026/);
  assert.equal(deterministicUtilityReply('Rispondi in una frase: perché il cielo è blu?', NOW), null);
  assert.equal(deterministicUtilityReply('Che giorno è il tuo compleanno?', NOW), null);
});

test('conteggio dei giorni calcolato: festività, date esplicite, anno successivo e oggi', () => {
  // Caso reale dal vivo: il modello diceva 79 giorni a Capodanno il 7 novembre.
  assert.equal(deterministicUtilityReply('E quanti giorni mancano a Capodanno?', NOW), 'Mancano 55 giorni a Capodanno.');
  assert.equal(deterministicUtilityReply('Quanti giorni mancano a Natale?', NOW), 'Mancano 48 giorni a Natale.');
  assert.equal(deterministicUtilityReply('quanti giorni mancano al 15 marzo?', NOW), 'Mancano 128 giorni al 15 marzo.');
  assert.equal(deterministicUtilityReply("Quanti giorni mancano all'8 marzo?", NOW), "Mancano 121 giorni all'8 marzo.");
  assert.equal(deterministicUtilityReply('Quanti giorni mancano alla vigilia di Natale?', NOW), 'Mancano 47 giorni alla Vigilia di Natale.');
  assert.equal(deterministicUtilityReply("Quanti giorni mancano all'Epifania?", NOW), "Mancano 60 giorni all'Epifania.");
  assert.equal(deterministicUtilityReply('Quanti giorni mancano al 7 novembre?', NOW), 'Il 7 novembre è oggi.');
  assert.equal(deterministicUtilityReply('Quanti giorni mancano al 1 gennaio 2026?', NOW), 'Il 1 gennaio 2026 è già passato da 310 giorni.');
  assert.equal(deterministicUtilityReply('Tra quanti giorni è Ferragosto?', NOW), 'Mancano 281 giorni a Ferragosto.');
  assert.equal(deterministicUtilityReply('Quanti giorni mancano al 31 febbraio?', NOW), null);
  assert.equal(deterministicUtilityReply('Quanti giorni mancano al mio esame?', NOW), null);
});

test('le istruzioni di sistema contengono data e ora correnti', () => {
  const { currentDateDirective, buildSystemPrompt } = require('../src/application/register-ipc');
  assert.match(currentDateDirective(NOW), /DATA E ORA CORRENTI: .*2026/);
  assert.match(buildSystemPrompt([], {}, [], [], NOW), /DATA E ORA CORRENTI: .*novembre 2026/);
});
