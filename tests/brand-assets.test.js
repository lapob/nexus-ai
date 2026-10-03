const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pngDimensions, sha256 } = require('../scripts/sync-brand-assets');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'brand-assets.json'), 'utf8'));

test('canonical public icon has the declared dimensions', () => {
  const canonical = fs.readFileSync(path.resolve(root, config.canonical));
  assert.deepEqual(pngDimensions(canonical), { width: 1024, height: 1024 });
});

for (const relative of config.exactCopies) {
  const destination = path.resolve(root, relative);
  const external = path.relative(root, destination).startsWith(`..${path.sep}`);
  const externalRoot = path.resolve(root, '..', relative.split('/')[1]);
  test(`public brand copy matches the canonical icon: ${relative}`, {
    skip: external && !fs.existsSync(externalRoot) ? 'Separate website checkout is not present; brand:check remains required for workstation releases.' : false,
  }, () => {
    const expected = sha256(fs.readFileSync(path.resolve(root, config.canonical)));
    assert.equal(sha256(fs.readFileSync(path.resolve(root, relative))), expected, relative);
  });
}

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
