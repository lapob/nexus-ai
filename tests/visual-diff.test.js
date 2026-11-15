const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compareImages } = require('../scripts/visual/lib/diff');
const { blank, decode, encode } = require('../scripts/visual/lib/png');
const { approve, createSuite } = require('../scripts/visual/lib/baselines');

function scene({ shift = 0, edge = 0, color = [94, 231, 223] } = {}) {
  const image = blank(160, 100);
  for (let y = 0; y < 100; y += 1) for (let x = 0; x < 160; x += 1) {
    const i = (y * 160 + x) * 4;
    const inside = x >= 40 + shift && x < 100 + shift && y >= 30 && y < 70;
    const rim = x === 40 + shift - 1 && y >= 30 && y < 70 ? edge : 0; // bordo antialias sub-pixel
    const [r, g, b] = inside ? color : [8, 12, 14];
    image.data[i] = rim ? Math.round(8 + (color[0] - 8) * rim) : r;
    image.data[i + 1] = rim ? Math.round(12 + (color[1] - 12) * rim) : g;
    image.data[i + 2] = rim ? Math.round(14 + (color[2] - 14) * rim) : b;
    image.data[i + 3] = 255;
  }
  return image;
}

test('immagini identiche e differenze di antialias sub-pixel non sono regressioni', () => {
  assert.equal(compareImages(scene(), scene()).diffPixels, 0);
  const result = compareImages(scene(), scene({ edge: 0.5 }));
  assert.equal(result.pass, true);
  assert.equal(result.diffPixels, 0);
});

test('un elemento spostato o ricolorato viene rilevato con riquadro e immagine delle differenze', () => {
  const moved = compareImages(scene(), scene({ shift: 6 }), { maxDiffPixels: 120 });
  assert.equal(moved.pass, false);
  // 6 px × 2 lati × 40 righe, meno la tolleranza di 1 px su ciascun bordo.
  assert.ok(moved.diffPixels >= 300 && moved.diffPixels <= 480, String(moved.diffPixels));
  // Le righe estreme trovano un vicino uguale entro 1 px: il riquadro è quello interno.
  assert.deepEqual([moved.box.top, moved.box.bottom], [31, 68]);
  assert.equal(moved.image.width, 160);
  assert.equal(compareImages(scene(), scene({ color: [255, 80, 120] })).pass, false);
  const resized = compareImages(scene(), blank(10, 10));
  assert.equal(resized.sizeMismatch, true);
  assert.equal(resized.pass, false);
});

test('PNG: codifica e decodifica conservano i pixel', () => {
  const image = scene({ edge: 0.3 });
  assert.deepEqual(Buffer.from(decode(encode(image)).data), Buffer.from(image.data));
});

test('baseline: mancante, approvata, superata, fallita con rapporto HTML e approvazione esplicita', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-visual-'));
  try {
    const first = createSuite({ root, suite: 'unit' });
    assert.equal(first.check('scena', encode(scene())).status, 'missing');
    assert.equal(first.finish().failed, 1);
    assert.throws(() => first.check('../fuori', encode(scene())), /non valido/);
    // L'approvazione copia solo le catture dell'ultima esecuzione, mai i controlli geometrici.
    assert.deepEqual(approve({ root, suite: 'unit' }), ['scena']);
    const baseline = path.join(root, 'qa-artifacts', 'visual-baselines', 'unit', 'scena.png');
    assert.ok(fs.existsSync(baseline));

    const second = createSuite({ root, suite: 'unit', defaults: { maxDiffPixels: 120 } });
    assert.equal(second.check('scena', encode(scene())).status, 'pass');
    assert.equal(second.check('scena', encode(scene({ shift: 6 }))).status, 'fail');
    second.assert('bordi', ['particelle tagliate sul bordo right'], encode(scene()));
    const summary = second.finish({ prova: 'unit' });
    assert.equal(summary.failed, 2);
    const html = fs.readFileSync(summary.report, 'utf8');
    assert.match(html, /data-status="fail"/);
    assert.match(html, /diff\/scena\.png/);
    assert.match(html, /particelle tagliate sul bordo right/);
    assert.ok(fs.existsSync(path.join(root, 'qa-artifacts', 'visual-runs', 'unit', 'diff', 'scena.png')));
    // Un confronto non riscrive mai la baseline.
    assert.deepEqual(decode(fs.readFileSync(baseline)).data, decode(encode(scene())).data);

    const third = createSuite({ root, suite: 'unit', update: true });
    assert.equal(third.check('scena', encode(scene({ shift: 6 }))).status, 'approved');
    assert.deepEqual(Buffer.from(decode(fs.readFileSync(baseline)).data), Buffer.from(scene({ shift: 6 }).data));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
