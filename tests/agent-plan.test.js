/**
 * @module tests/agent-plan
 * @description Piano visibile dell'agente: strumento senza effetti, normalizzazione sicura, budget per compiti lunghi.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTurnTools, normalizePlan } = require('../src/application/agent-chat');
const { AgentLoop, AGENT_GUIDANCE, fitMessages } = require('../src/agents/agent-loop');

test('il piano viene normalizzato: testo pulito, stati noti, un solo passo in corso, massimo 8', () => {
  const plan = normalizePlan([
    { title: '  Cerco\nvoli  ', status: 'done' }, { title: 'Hotel', status: 'in_progress' }, { title: 'Itinerario', status: 'in_progress' },
    { title: 'x'.repeat(200), status: 'boh' }, { title: '', status: 'pending' }, ...Array.from({ length: 10 }, (_, i) => ({ title: `p${i}`, status: 'pending' }))
  ]);
  assert.equal(plan.length, 7, 'oltre 8 voci tagliate e titoli vuoti scartati');
  assert.deepEqual(plan.slice(0, 3), [{ title: 'Cerco voli', status: 'done' }, { title: 'Hotel', status: 'in_progress' }, { title: 'Itinerario', status: 'pending' }]);
  assert.equal(plan[3].title.length, 90);
  assert.equal(plan[3].status, 'pending');
  assert.deepEqual(normalizePlan('non una lista'), []);
});

test('update-plan è a basso rischio, senza consenso, e pubblica il piano all interfaccia', async () => {
  const published = [];
  const { registry } = createTurnTools({ onPlan: (plan) => published.push(plan) });
  const tool = registry.list().find((item) => item.name === 'update-plan');
  assert.ok(tool, 'strumento registrato');
  assert.equal(tool.requiresConsent ?? false, false);
  assert.equal(tool.risk, 'low');
  assert.equal(registry.validate('update-plan', { steps: [{ title: 'Uno', status: 'fatto' }] }).ok, false, 'stato sconosciuto rifiutato');
  const result = await registry.invoke('update-plan', { steps: [{ title: 'Uno', status: 'done' }, { title: 'Due', status: 'in_progress' }] }, {});
  assert.deepEqual(result, { shown: true, revision: 1, done: 1, total: 2 });
  assert.deepEqual(published, [[{ title: 'Uno', status: 'done' }, { title: 'Due', status: 'in_progress' }]]);
  assert.match(AGENT_GUIDANCE, /update-plan/);
});

test('compiti lunghi: fino a 16 passi e 64 messaggi senza tagliare il turno in corso', () => {
  const runtime = { chat: async () => ({}) };
  const tools = { definitionsForModel: () => [], list: () => [] };
  assert.doesNotThrow(() => new AgentLoop({ runtime, tools, maxSteps: 12 }));
  assert.throws(() => new AgentLoop({ runtime, tools, maxSteps: 17 }), /tra 1 e 16/);
  const transcript = [{ role: 'system', content: 's' }, ...Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }))];
  const fitted = fitMessages(transcript, 1);
  assert.equal(fitted.messages.length, 61);
});
