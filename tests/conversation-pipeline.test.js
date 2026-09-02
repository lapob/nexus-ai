const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MockProvider } = require('../src/ai/providers/mock-provider');
const { ConversationStore } = require('../src/infrastructure/storage/conversation-store');
const { compactConversationHistory } = require('../src/application/context-compaction');

test('pipeline conversazione: frase riconosciuta, stream, completamento e persistenza', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-e2e-'));
  const provider = new MockProvider();
  const store = new ConversationStore({ filePath: path.join(root, 'conversation.sqlite3') });
  try {
    await provider.initialize({ chatModel: 'nexus-test' });
    const recognizedText = 'Spiegami il funzionamento della memoria locale';
    const tokens = [];
    const result = await provider.streamChat({ requestId: 'voice-turn', messages: [...compactConversationHistory([], { tier: 'balanced' }), { role: 'user', content: recognizedText }] }, { onToken: (token) => tokens.push(token) });
    const answer = result.message.content || tokens.join('');
    assert.ok(answer.length > 0);
    store.save({ id: 'voice-turn', title: recognizedText, createdAt: 1, updatedAt: 2, turns: [{ role: 'user', content: recognizedText, createdAt: 1 }, { role: 'assistant', content: answer, createdAt: 2 }] });
    const restored = store.list()[0];
    assert.equal(restored.turns.length, 2);
    assert.equal(restored.turns[0].content, recognizedText);
    assert.equal(restored.turns[1].content, answer);
  } finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
