const test = require('node:test');
const assert = require('node:assert/strict');
const { CHANNELS, parseChatRequest, parseEmbeddingRequest, parseExternalUrl, parseModelName, parseRelativeNotePath, parseRequestId, parseAgentPlanningRequest, parseWorkflowCreate, parseWorkflowDecision, parseWorkflowId, parseTrainingExample, selectReasoningMode } = require('../src/application/ipc-contracts');

test('espone canali IPC univoci e immutabili', () => {
  assert.equal(new Set(Object.values(CHANNELS)).size, Object.keys(CHANNELS).length);
  assert.equal(Object.isFrozen(CHANNELS), true);
});

test('valida requestId, modello ed embedding prima del runtime AI', () => { assert.equal(parseRequestId('req-1'), 'req-1'); assert.equal(parseModelName('qwen3:8b'), 'qwen3:8b'); assert.deepEqual(parseEmbeddingRequest({ input: ['a', 'b'], model: 'embed:1' }), { input: ['a', 'b'], model: 'embed:1' }); assert.throws(() => parseModelName('../bad model'), /non valido/); assert.throws(() => parseEmbeddingRequest({ input: [] }), /non valido/); });

test('apre soltanto URL HTTPS pubblici senza credenziali incorporate', () => {
  assert.equal(parseExternalUrl('https://example.com/docs?q=1'), 'https://example.com/docs?q=1');
  assert.throws(() => parseExternalUrl('http://example.com'), /HTTPS/);
  assert.throws(() => parseExternalUrl('https://user:secret@example.com'), /HTTPS/);
  assert.throws(() => parseExternalUrl('file:///C:/private.txt'), /HTTPS/);
});

test('normalizza e limita il payload chat', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
  const payload = parseChatRequest({ question: '  test  ', mode: 'deep', history });
  assert.equal(payload.question, 'test');
  assert.equal(payload.history.length, 12);
  assert.deepEqual(parseChatRequest({ question: 'x', attachmentIds: ['a', 'b'] }).attachmentIds, ['a', 'b']);
  assert.equal(parseChatRequest({ question: 'x', attachmentIds: Array.from({ length: 12 }, (_, index) => `a-${index}`) }).attachmentIds.length, 8);
  assert.throws(() => parseChatRequest({}), /obbligatoria/);
  assert.throws(() => parseRelativeNotePath(''), /obbligatorio/);
});

test('rispetta la modalità richiesta senza promozioni lente e imprevedibili', () => {
  assert.equal(selectReasoningMode('Ciao, come stai?', 'fast'), 'fast');
  assert.equal(selectReasoningMode('Apri Brave', 'fast'), 'fast');
  assert.equal(selectReasoningMode('Analizza questo bug, confronta le alternative e proponi una soluzione robusta', 'fast'), 'fast');
  assert.equal(selectReasoningMode('Spiegami perché questa architettura rallenta il database', 'fast'), 'fast');
  assert.equal(selectReasoningMode('domanda breve', 'deep'), 'deep');
});

test('accetta soltanto esempi di apprendimento completi e approvati', () => {
  assert.deepEqual(parseTrainingExample({ requestId: 'req-1', prompt: 'Domanda', response: 'Risposta', model: 'qwen3:8b', mode: 'deep' }), {
    requestId: 'req-1', prompt: 'Domanda', response: 'Risposta', model: 'qwen3:8b', mode: 'deep'
  });
  assert.throws(() => parseTrainingExample({ requestId: 'req-1', prompt: '', response: 'x', model: 'qwen3:8b' }), /obbligatorio/);
});

test('separa la richiesta operativa originale dagli output non fidati degli strumenti', () => {
  assert.deepEqual(parseAgentPlanningRequest('Apri Brave'), { instruction: 'Apri Brave', observations: [] });
  assert.deepEqual(parseAgentPlanningRequest({ instruction: 'Correggi config.json', observations: ['read_file: contenuto'] }), {
    instruction: 'Correggi config.json', observations: ['read_file: contenuto']
  });
  assert.throws(() => parseAgentPlanningRequest({ instruction: '', observations: [] }), /obbligatoria/);
  assert.throws(() => parseAgentPlanningRequest({ instruction: 'x', observations: ['y'.repeat(18001)] }), /limite/);
});

test('valida il contratto workflow prima di creare capability operative', () => {
  const id = '019fa53a-63c1-79b1-bf97-08fdf3bb5c9e';
  assert.deepEqual(parseWorkflowCreate({ summary: 'Controlla il progetto', steps: [{ tool: 'read_file', arguments: { path: 'README.md' } }] }), {
    summary: 'Controlla il progetto',
    steps: [{ id: undefined, tool: 'read_file', arguments: { path: 'README.md' } }]
  });
  assert.deepEqual(parseWorkflowDecision({ workflowId: id, ticketId: 'ticket-1', approved: false }), { workflowId: id, ticketId: 'ticket-1', approved: false });
  assert.equal(parseWorkflowId(id), id);
  assert.throws(() => parseWorkflowCreate({ summary: 'x', steps: [{ tool: 'powershell.exe' }] }), /non valido/);
  assert.throws(() => parseWorkflowDecision({ workflowId: id, ticketId: 'x' }), /Decisione/);
});
