/**
 * @module tests/knowledge-publication-contract
 * @description Impedisce che la knowledge pubblica venga rigenerata dalla vault privata.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('il pack distribuito deriva soltanto dalla vault pubblica autorevole', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'publish-knowledge.js'), 'utf8');
  assert.match(source, /path\.resolve\(root, '\.\.', '\.knowledge-public'\)/);
  assert.doesNotMatch(source, /path\.resolve\(root, '\.\.', '\.knowledge-private'\)/);
  assert.match(source, /fs\.cpSync\(staging, pack/);
  assert.doesNotMatch(source, /fs\.rmSync\(source/);
  assert.match(source, /audit-knowledge-governance\.js/);
  assert.match(source, /'--strict'/);
  assert.match(source, /benchmark-private-knowledge\.js/);
  assert.match(source, /'--min-citation-coverage=90'/);
});
