const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const checker = path.resolve(__dirname, '..', 'scripts', 'check-private-knowledge.js');
const frontmatter = `---
type: guide
area: test
status: evergreen
level: foundation
---`;

function runVault(notes) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-knowledge-lint-'));
  for (const [name, body] of Object.entries(notes)) {
    fs.writeFileSync(path.join(vault, `${name}.md`), `${frontmatter}\n# ${name}\n\n${body}\n`);
  }
  const result = spawnSync(process.execPath, [checker, `--vault=${vault}`], { encoding: 'utf8' });
  fs.rmSync(vault, { recursive: true, force: true });
  return result;
}

test('il lint segnala i collegamenti Obsidian non risolti', () => {
  const result = runVault({ Principale: 'Vedi [[Nota assente]].' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /collegamento non risolto \[\[Nota assente\]\]/);
});

test('il lint risolve percorsi e ignora la sintassi Bash nei blocchi di codice', () => {
  const result = runVault({
    Principale: 'Vedi [[Secondaria|la seconda nota]].\n\n```bash\nif [[ -d "$target" ]]; then true; fi\n```',
    Secondaria: 'Contenuto verificabile.',
  });
  assert.equal(result.status, 0, result.stderr);
});
