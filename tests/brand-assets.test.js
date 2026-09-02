const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pngDimensions, sha256 } = require('../scripts/sync-brand-assets');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'brand-assets.json'), 'utf8'));

test('all exact public brand assets match the canonical icon', () => {
  const canonical = fs.readFileSync(path.resolve(root, config.canonical));
  const expected = sha256(canonical);
  assert.deepEqual(pngDimensions(canonical), { width: 1024, height: 1024 });
  for (const relative of config.exactCopies) {
    assert.equal(sha256(fs.readFileSync(path.resolve(root, relative))), expected, relative);
  }
});

test('platform variants exist at their declared dimensions', () => {
  for (const variant of config.platformVariants) {
    const candidate = path.resolve(root, variant.path);
    assert.equal(fs.existsSync(candidate), true, variant.path);
    if (variant.width || variant.height) {
      assert.deepEqual(pngDimensions(fs.readFileSync(candidate)), {
        width: variant.width,
        height: variant.height
      });
    }
  }
});
