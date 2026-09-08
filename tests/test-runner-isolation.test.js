/**
 * @module tests/test-runner-isolation
 * @description La suite pulisce il proprio spazio e conserva temporanei di verifiche concorrenti.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// #region Esecuzione reale del runner in fixture

test('il runner isola TEMP e non elimina directory create da altre verifiche', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-runner-'));
  const fixture = path.join(temporary, 'app');
  const foreign = path.join(temporary, 'nexus-motion-concurrent');
  fs.mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'tests'));
  fs.copyFileSync(path.resolve(__dirname, '../scripts/run-tests.js'), path.join(fixture, 'scripts/run-tests.js'));
  fs.writeFileSync(path.join(fixture, 'tests/probe.test.js'), `
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    require('node:test')('temporary ownership', () => {
      fs.mkdirSync(${JSON.stringify(foreign)});
      fs.writeFileSync(path.join(${JSON.stringify(foreign)}, 'keep.txt'), 'other check');
      require('node:assert/strict').equal(path.dirname(os.tmpdir()), ${JSON.stringify(path.join(fixture, 'qa-artifacts/test-tmp'))});
      fs.writeFileSync(path.join(os.tmpdir(), 'owned.txt'), 'own check');
    });
  `);
  try {
    const environment = { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [path.join(fixture, 'scripts/run-tests.js')], {
      env: environment,
      encoding: 'utf8', windowsHide: true
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.readFileSync(path.join(foreign, 'keep.txt'), 'utf8'), 'other check');
    assert.deepEqual(fs.readdirSync(path.join(fixture, 'qa-artifacts/test-tmp')), []);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

// #endregion
