const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('la UI unica (web e desktop) rende Markdown semantico anche durante lo streaming', () => {
  const markdown = fs.readFileSync(path.join(root, 'web/src/Markdown.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'web/src/App.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'web/src/styles.css'), 'utf8');
  // Lo stesso renderer viene usato mentre i token arrivano e a risposta completa.
  assert.match(app, /<Markdown text=\{message\.content\} \/>/);
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML|\.innerHTML\s*=/);
  for (const kind of ['code', 'table', 'callout', 'formula', 'list']) assert.match(markdown, new RegExp(`kind: '${kind}'`));
  assert.match(markdown, /un fence o una formula non ancora chiusi durante lo streaming/);
  assert.match(markdown, /start: ordered \? Number\.parseInt\(item\[2\], 10\) \|\| 1/);
  assert.match(markdown, /className="math-inline" role="math"/);
  assert.match(markdown, /className="math-block" role="math"/);
  assert.match(markdown, /SUPERSCRIPTS/);
  assert.match(markdown, /url\.protocol === 'https:'/);
  for (const selector of ['.callout', '.table-wrap', '.math-block']) assert.ok(styles.includes(selector), selector);
  assert.match(styles, /Cambria Math/);
});

test('una ricerca live indisponibile termina con una risposta deterministica senza fatti obsoleti', () => {
  const source = fs.readFileSync(path.join(root, 'src/application/register-ipc.js'), 'utf8');
  assert.match(source, /function publicResearchUnavailableAnswer/);
  assert.match(source, /prepared\.research\.unavailable && prepared\.research\.policy\.level === 'required'/);
  assert.match(source, /Non ti darò un dato potenzialmente superato come se fosse attuale/);
});

test('il prompt impedisce marcatori incompleti e abilita blocchi semantici', () => {
  const ipc = fs.readFileSync(path.join(root, 'src/application/register-ipc.js'), 'utf8');
  assert.match(ipc, /> \[!RESULT\]/);
  assert.match(ipc, /> \[!WARNING\]/);
  assert.match(ipc, /Non mostrare marcatori Markdown incompleti/);
  assert.match(ipc, /blocchi con linguaggio dichiarato per codice completo/);
});
