const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeCoreEdges } = require('../scripts/visual/lib/edges');
const { blank } = require('../scripts/visual/lib/png');

// Particelle sintetiche: dischi antialias su fondo trasparente, come la cattura isolata del Core.
function disc(image, cx, cy, radius, alpha = 255) {
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
      const i = (y * image.width + x) * 4 + 3;
      image.data[i] = Math.min(255, image.data[i] + Math.round(alpha * coverage));
    }
  }
}

// Nucleo che sfuma verso i bordi: luce piena al centro, nulla negli ultimi 40 px.
function featheredCore(width = 400, height = 300) {
  const image = blank(width, height);
  for (let i = 0; i < 1500; i += 1) {
    const x = 6 + ((i * 97.13) % (width - 12)), y = 6 + ((i * 53.71) % (height - 12));
    const edge = Math.min(x, y, width - x, height - y);
    disc(image, x, y, 1.6, Math.round(255 * Math.max(0, Math.min(1, (edge - 40) / 60))));
  }
  return image;
}

const full = (width, height) => ({ canvas: { left: 0, top: 0, right: width, bottom: height }, viewport: { left: 0, top: 0, right: width, bottom: height } });

test('un nucleo che sfuma verso i bordi non è segnalato come tagliato', () => {
  const image = featheredCore();
  const result = analyzeCoreEdges(image, full(400, 300));
  assert.deepEqual(result.problems, []);
  assert.ok(result.sides.every((side) => side.peak <= 12));
});

test('particelle a luce piena sul bordo del canvas sono un taglio netto (box invisibile)', () => {
  const image = featheredCore();
  for (let y = 20; y < 280; y += 9) disc(image, 399.5, y, 2.2); // fila di particelle tagliate dal bordo destro
  const result = analyzeCoreEdges(image, full(400, 300));
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /bordo right \(canvas, 400px\)/);
});

test('il bordo di un contenitore che ritaglia conta come il bordo del canvas', () => {
  const image = featheredCore(400, 300);
  for (let x = 30; x < 370; x += 11) disc(image, x, 81, 2.4); // particelle vive lungo il bordo superiore dello stage
  const geometry = { ...full(400, 300), clip: { left: 0, top: 80.4, right: 400, bottom: 300 } };
  const result = analyzeCoreEdges(image, geometry);
  assert.ok(result.problems.some((problem) => /bordo top \(area visibile, 81px\)/.test(problem)), result.problems.join('\n'));
});

test('pochi pixel isolati sul bordo restano tollerati, una cattura vuota no', () => {
  const image = featheredCore();
  disc(image, 0.5, 150, 0.6);
  assert.deepEqual(analyzeCoreEdges(image, full(400, 300)).problems, []);
  assert.match(analyzeCoreEdges(blank(400, 300), full(400, 300)).problems.join(), /quasi invisibile/);
  assert.match(analyzeCoreEdges(blank(400, 300), { canvas: { left: 0, top: 0, right: 2, bottom: 2 } }).problems.join(), /non visibile/);
});
