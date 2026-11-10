const test = require('node:test');
const assert = require('node:assert/strict');

test('le fasi che si estendono o si ripetono diventano un solo passaggio', async () => {
  const { mergeStep } = await import('../web/src/steps.ts');
  let steps = mergeStep([], 'Comprendo la richiesta…');
  steps = mergeStep(steps, 'Comprendo la richiesta e preparo il contesto…');
  steps = mergeStep(steps, 'Raccolgo le informazioni utili…');
  steps = mergeStep(steps, 'Comprendo la richiesta…');
  steps = mergeStep(steps, 'Genero la risposta…');
  assert.deepEqual(steps, ['Comprendo la richiesta e preparo il contesto…', 'Raccolgo le informazioni utili…', 'Genero la risposta…']);
  assert.deepEqual(mergeStep(steps, '  '), steps);
});
