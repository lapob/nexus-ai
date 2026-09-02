const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/check-code-overlap.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('il gate di igiene rileva file identici e moduli dichiarati due volte', () => {
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /@module\\s\+/);
  assert.match(source, /Contenuto duplicato/);
  assert.match(source, /@module duplicato/);
  assert.match(pkg.scripts['check:hygiene'], /check:overlap/);
});
