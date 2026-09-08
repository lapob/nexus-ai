const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createQaProfile } = require('../scripts/qa-profile');

test('QA profile cleanup is scoped to its owned directory and idempotent', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-qa-owner-'));
  try {
    const owned = createQaProfile(parent, 'profile-');
    fs.mkdirSync(path.join(owned.path, 'cache'));
    fs.writeFileSync(path.join(owned.path, 'cache', 'data'), 'fixture');
    const sibling = path.join(parent, 'keep');
    fs.writeFileSync(sibling, 'preserve');
    owned.dispose();
    owned.dispose();
    assert.equal(fs.existsSync(owned.path), false);
    assert.equal(fs.readFileSync(sibling, 'utf8'), 'preserve');
    assert.throws(() => createQaProfile(parent, '../escape-'), /Invalid/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('QA cleanup refuses a linked descendant and preserves its destination', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-qa-owner-'));
  const owned = createQaProfile(parent, 'profile-');
  const destination = path.join(parent, 'protected');
  const link = path.join(owned.path, 'link');
  try {
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, 'data'), 'preserve');
    fs.symlinkSync(destination, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => owned.dispose(), /Linked/);
    assert.equal(fs.readFileSync(path.join(destination, 'data'), 'utf8'), 'preserve');
  } finally {
    fs.unlinkSync(link);
    owned.dispose();
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
