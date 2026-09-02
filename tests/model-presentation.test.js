const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('il renderer non mostra identificatori tecnici dei modelli NexusNXS', () => {
  const source = fs.readFileSync(require.resolve('../src/renderer/systems/ModelPresentation.ts'), 'utf8');
  assert.match(source, /qwen3:14\\\.b|qwen3:14b/i);
  assert.match(source, /NexusNXS Prime/);
  assert.match(source, /NexusNXS Local/);
  assert.match(source, /uniquePresentedModels/);
  assert.match(source, /visible\.has\(key\)/);
});
