/**
 * @module scripts/visual/lib/diff
 * @description Confronto percettivo tra due PNG: differenza di colore in YIQ (come pixelmatch) con tolleranza di
 * 1 px per l'antialias e i bordi sub-pixel. Un pixel conta come cambiato solo se non trova un pixel simile nel suo
 * intorno 3×3 in entrambe le direzioni; il rumore isolato del rasterizzatore resta quindi sotto soglia, mentre un
 * taglio, un elemento spostato o un colore diverso no.
 */
const { blank } = require('./png');

// #region 01 — Distanza di colore percettiva

const MAX_YIQ_DELTA = 35215; // differenza YIQ massima possibile (nero ↔ bianco), come in pixelmatch

/** Defaults: `threshold` è la sensibilità di colore (0..1), `maxDiffRatio` la quota di pixel cambiati ammessa. */
const DEFAULTS = Object.freeze({ threshold: 0.1, maxDiffRatio: 0.002, maxDiffPixels: Infinity, tolerance: 1 });

// Colore composto su uno sfondo neutro: due pixel trasparenti di colore diverso restano uguali.
function blend(channel, alpha) { return 255 + (channel - 255) * alpha; }

function yiqDelta(a, i, b, j) {
  const aa = a[i + 3] / 255, ab = b[j + 3] / 255;
  const r1 = blend(a[i], aa), g1 = blend(a[i + 1], aa), b1 = blend(a[i + 2], aa);
  const r2 = blend(b[j], ab), g2 = blend(b[j + 1], ab), b2 = blend(b[j + 2], ab);
  // Anche l'alpha conta (i catturati del Core sono su fondo trasparente).
  const alpha = (a[i + 3] - b[j + 3]) * 0.5;
  const y = (r1 - r2) * 0.29889531 + (g1 - g2) * 0.58662247 + (b1 - b2) * 0.11448223;
  const iq = (r1 - r2) * 0.59597799 - (g1 - g2) * 0.2741761 - (b1 - b2) * 0.32180189;
  const q = (r1 - r2) * 0.21147017 - (g1 - g2) * 0.52261711 + (b1 - b2) * 0.31114694;
  return 0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q + alpha * alpha;
}

function closest(a, b, width, height, x, y, radius) {
  const i = (y * width + x) * 4;
  let best = Infinity;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const xx = x + dx;
      if (xx < 0 || xx >= width) continue;
      const delta = yiqDelta(a, i, b, (yy * width + xx) * 4);
      if (delta < best) { best = delta; if (best === 0) return 0; }
    }
  }
  return best;
}

// #endregion
// #region 02 — Confronto tra immagini

/**
 * Confronta `actual` con `expected` (stesse dimensioni). Restituisce conteggio, quota e immagine delle differenze
 * (base attenuata in grigio, pixel cambiati in rosso), più il riquadro che li contiene.
 */
function compareImages(expected, actual, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return { sizeMismatch: true, diffPixels: Infinity, diffRatio: 1, pass: false, box: null, image: null,
      detail: `dimensioni ${expected.width}×${expected.height} → ${actual.width}×${actual.height}` };
  }
  const { width, height } = expected;
  const a = expected.data, b = actual.data;
  const limit = MAX_YIQ_DELTA * settings.threshold * settings.threshold;
  const out = blank(width, height);
  let diffPixels = 0;
  let box = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const exact = yiqDelta(a, i, b, i);
      const changed = exact > limit
        && closest(a, b, width, height, x, y, settings.tolerance) > limit
        && closest(b, a, width, height, x, y, settings.tolerance) > limit;
      if (changed) {
        diffPixels += 1;
        out.data[i] = 255; out.data[i + 1] = 40; out.data[i + 2] = 72; out.data[i + 3] = 255;
        if (!box) box = { left: x, top: y, right: x, bottom: y };
        else { box.left = Math.min(box.left, x); box.right = Math.max(box.right, x); box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y); }
      } else {
        const gray = 255 - (255 - (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11)) * (a[i + 3] / 255) * 0.25;
        out.data[i] = gray; out.data[i + 1] = gray; out.data[i + 2] = gray; out.data[i + 3] = 255;
      }
    }
  }
  const diffRatio = diffPixels / (width * height);
  return { sizeMismatch: false, diffPixels, diffRatio, box, image: out,
    pass: diffRatio <= settings.maxDiffRatio && diffPixels <= settings.maxDiffPixels };
}

// #endregion

module.exports = { DEFAULTS, compareImages, yiqDelta };
