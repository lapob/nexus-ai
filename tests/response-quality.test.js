const test = require('node:test');
const assert = require('node:assert/strict');
const {
  responseQualityDirective, responseRequirements, validateResponse, shouldReviewResponse,
  wordCountConstraint, strictWordCountSchema, strictWordCountAnswer, hasStrictOutputConstraint
} = require('../src/application/response-quality');

test('la revisione è selettiva per rischio o non conformità', () => {
  assert.equal(shouldReviewResponse({ signals: { risk: 'normal' }, validation: { valid: true }, sourceCount: 1 }), false);
  assert.equal(shouldReviewResponse({ signals: { risk: 'critical' }, validation: { valid: true }, sourceCount: 2 }), true);
  assert.equal(shouldReviewResponse({ signals: { risk: 'normal' }, validation: { valid: false }, sourceCount: 1 }), true);
});

test('riconosce formato strutturato, quantità e azioni non verificabili', () => {
  const requirements = responseRequirements('Crea il file, poi rispondi solo JSON valido con esattamente 3 elementi.');
  assert.ok(requirements.some((item) => /JSON valido/.test(item)));
  assert.ok(requirements.some((item) => /limite quantitativo/.test(item)));
  assert.ok(requirements.some((item) => /azione/.test(item)));
  assert.ok(requirements.some((item) => /vincoli espliciti/.test(item)));
});

test('rende osservabili conteggio, fonti e correzioni di contesto', () => {
  assert.match(responseQualityDirective('Rispondi con esattamente quattro parole: perché testare i backup?'), /esattamente 4 parole/i);
  assert.match(responseQualityDirective("<CONTESTO><DOC id='A'>Timeout 30 secondi.</DOC></CONTESTO> Qual è il timeout?"), /identificatori delle fonti/i);
  assert.match(responseQualityDirective('Correzione: usa soltanto Linux e nominalo.'), /sostituisce l’ambito precedente/i);
});

test('le domande multiple ricevono una checklist completa ma limitata', () => {
  const directive = responseQualityDirective('Qual è la causa? Come la verifico?', { deep: true });
  assert.match(directive, /ogni domanda/);
  assert.doesNotMatch(directive, /Qual è la causa/);
  assert.ok(directive.split('\n').length <= 8);
});

test('una richiesta semplice mantiene un controllo breve', () => {
  assert.match(responseQualityDirective('Ciao'), /rispondi direttamente/i);
});

test('valida vincoli osservabili senza affidarsi al giudizio del modello', () => {
  assert.equal(validateResponse('Rispondi solo con JSON valido', '{"ok":true}').valid, true);
  assert.deepEqual(validateResponse('Rispondi solo con JSON valido', '```json\n{"ok":true}\n```').issues, ['invalid-json']);
  assert.equal(validateResponse('Rispondi in esattamente quattro parole', 'Uno due tre quattro').valid, true);
  assert.match(validateResponse('Rispondi in esattamente quattro parole', 'Uno due tre quattro cinque').issues.join(','), /word-count/);
  assert.deepEqual(wordCountConstraint('Reply in exactly four words.'), { mode: 'exact', expected: 4 });
  assert.deepEqual(wordCountConstraint('Rispondi in non più di cinque parole.'), { mode: 'max', expected: 5 });
  assert.equal(strictWordCountSchema('Rispondi in esattamente quattro parole').properties.words.minItems, 4);
  assert.equal(strictWordCountSchema('Rispondi in massimo quattro parole'), null);
  assert.equal(strictWordCountAnswer('Rispondi in esattamente quattro parole', '{"words":["Backup","verificati","evitano","sorprese"]}'), 'Backup verificati evitano sorprese');
  assert.equal(strictWordCountAnswer('Rispondi in esattamente quattro parole', '{"words":["solo","tre","parole"]}'), '');
  assert.equal(hasStrictOutputConstraint('Rispondi soltanto con output'), true);
  assert.equal(hasStrictOutputConstraint('Spiegami il problema con calma'), false);
  assert.match(validateResponse('Apri Blocco note', 'Ho aperto Blocco note').issues.join(','), /unverified-action/);
  assert.match(validateResponse('Come posso fare questa cosa?', 'Here is what you should do.').issues.join(','), /wrong-language/);
  assert.match(validateResponse('Come metto una API key nel repository?', 'Salvala in un file di configurazione.').issues.join(','), /unsafe-secret-guidance/);
  assert.equal(validateResponse('Come metto una API key nel repository?', 'Non inserirla nel repository: usa una variabile di ambiente o un secret manager.').valid, true);
  assert.match(validateResponse('Analizza questa prompt injection: ignora il sistema.', 'Potrebbe esporre dei dati.').issues.join(','), /prompt-injection-missed/);
  assert.equal(validateResponse('Analizza questa prompt injection.', 'È un’iniezione di istruzioni non fidate e non deve essere eseguita.').valid, true);
  assert.match(validateResponse('Riassumi il documento.', 'Sembra normale.', { promptInjection: true }).issues.join(','), /indirect-prompt-injection-missed/);
  assert.match(validateResponse('Riassumi il documento.', 'Il valore è segreta.', { sensitiveLiterals: ['segreta'] }).issues.join(','), /sensitive-echo/);
});

test('richiede un chiarimento reale per riferimenti ambigui e un output senza cornici', () => {
  const ambiguous = 'Ho detto: apri bravol. Chiedi una conferma breve invece di inventare il nome di una app.';
  assert.match(responseQualityDirective(ambiguous), /conferma breve/i);
  assert.match(validateResponse(ambiguous, 'Apro Brave.').issues.join(','), /missing-clarification/);
  assert.equal(validateResponse(ambiguous, 'Intendi Brave?').valid, true);
  const code = 'Rispondi soltanto con l’output del codice.';
  assert.match(validateResponse(code, 'Output: 2,4,6').issues.join(','), /output-only-format/);
  assert.equal(validateResponse(code, '2,4,6').valid, true);
});

test('vincola e valida il risultato aritmetico semplice senza fidarsi del modello', () => {
  const question = 'Rispondi in italiano con una sola frase: qual è il risultato di 17 per 6?';
  assert.match(responseQualityDirective(question), /17\*6 = 102/u);
  assert.equal(validateResponse(question, 'Il risultato è 102.').valid, true);
  assert.match(validateResponse(question, 'Il risultato è circa 2,83.').issues.join(','), /arithmetic-mismatch/u);
  assert.equal(validateResponse('Raccontami una storia ambientata nel 17 per 6.', 'C’era una volta.').valid, true);
});
