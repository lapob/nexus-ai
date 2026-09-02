const test = require('node:test');
const assert = require('node:assert/strict');
const { compactConversationHistory } = require('../src/application/context-compaction');

test('compatta i turni vecchi e conserva integralmente quelli recenti', () => {
  const history = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `turno ${index} ${'x'.repeat(500)}` }));
  const compacted = compactConversationHistory(history, { tier: 'performance' });
  assert.equal(compacted[0].role, 'system');
  assert.match(compacted[0].content, /Riepilogo deterministico/);
  assert.equal(compacted.length, 9);
  assert.match(compacted.at(-1).content, /turno 13/);
});

test('il profilo lite usa soltanto gli ultimi tre turni brevi', () => {
  const history = Array.from({ length: 8 }, (_, index) => ({ role: 'user', content: `${index}${'x'.repeat(3000)}` }));
  const compacted = compactConversationHistory(history, { tier: 'lite' });
  assert.equal(compacted.length, 3);
  assert.ok(compacted.every((turn) => turn.content.length <= 1800));
});

test('la compattazione conserva vincoli e decisioni espliciti dei turni più vecchi', () => {
  const history = [
    { role: 'user', content: 'Voglio un’interfaccia senza navbar tradizionale.' },
    { role: 'assistant', content: 'Decisione verificata: resta una superficie minimale.' },
    ...Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `Turno ordinario ${index}.` }))
  ];
  const compacted = compactConversationHistory(history, { tier: 'ultra' });
  assert.match(compacted[0].content, /Vincoli e decisioni espliciti/i);
  assert.match(compacted[0].content, /senza navbar tradizionale/i);
});
