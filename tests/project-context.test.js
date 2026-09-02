const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { clearProjectContextCache, projectContextDirective, summarizeProject } = require('../src/application/project-context');

test('riassume il progetto senza indicizzare segreti o dipendenze', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export {};'); fs.writeFileSync(path.join(root, '.env'), 'TOKEN=x');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', build: 'vite build' } }));
  const summary = summarizeProject(root);
  assert.deepEqual(summary.scripts, ['test', 'build']); assert.equal(summary.files, 2);
  assert.match(projectContextDirective({ active: true, path: root }), /comandi disponibili test, build/);
  fs.writeFileSync(path.join(root, 'src', 'cached.ts'), 'export {};');
  assert.match(projectContextDirective({ active: true, path: root }), /2 file/);
  clearProjectContextCache();
  assert.match(projectContextDirective({ active: true, path: root }), /3 file/);
});
