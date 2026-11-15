/**
 * @module scripts/visual/lib/edges
 * @description Controllo geometrico "nessuna particella tagliata". Su una cattura del solo canvas del Core con
 * sfondo trasparente (alpha = luce delle particelle), l'alpha deve essere quasi zero:
 *  - lungo i bordi del canvas che cadono nell'area visibile;
 *  - lungo i bordi dell'area visibile (contenitore che ritaglia ∩ finestra), dove le particelle devono sfumare.
 * Un "box invisibile" lascia luce piena fino al bordo: una fila di pixel accesi allineati su una retta.
 * Pura e senza browser: i test unitari la verificano su immagini sintetiche.
 */

// #region 01 — Geometria e strisce di bordo

/** Soglie predefinite (alpha 0..255). */
const EDGE_DEFAULTS = Object.freeze({ depth: 2, maxAlpha: 12, maxLitPixels: 3, minTotalAlpha: 20_000 });

/** Rettangolo intero, interno e non vuoto: i pixel solo parzialmente coperti non contano come bordo. */
function innerRect(rect, image) {
  const left = Math.max(0, Math.ceil(rect.left));
  const top = Math.max(0, Math.ceil(rect.top));
  const right = Math.min(image.width, Math.floor(rect.right));
  const bottom = Math.min(image.height, Math.floor(rect.bottom));
  return right - left >= 4 && bottom - top >= 4 ? { left, top, right, bottom } : null;
}

function intersect(...rects) {
  const valid = rects.filter(Boolean);
  const out = { left: Math.max(...valid.map((r) => r.left)), top: Math.max(...valid.map((r) => r.top)),
    right: Math.min(...valid.map((r) => r.right)), bottom: Math.min(...valid.map((r) => r.bottom)) };
  return out.right > out.left && out.bottom > out.top ? out : null;
}

/** Statistiche dell'alpha in una striscia profonda `depth` px all'interno di `rect`, sul lato indicato. */
function bandStats(image, rect, side, depth, maxAlpha) {
  const { left, top, right, bottom } = rect;
  const xs = side === 'left' ? [left, Math.min(right, left + depth)] : side === 'right' ? [Math.max(left, right - depth), right] : [left, right];
  const ys = side === 'top' ? [top, Math.min(bottom, top + depth)] : side === 'bottom' ? [Math.max(top, bottom - depth), bottom] : [top, bottom];
  let peak = 0, lit = 0, at = null;
  for (let y = ys[0]; y < ys[1]; y += 1) {
    for (let x = xs[0]; x < xs[1]; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      if (alpha > maxAlpha) lit += 1;
      if (alpha > peak) { peak = alpha; at = { x, y }; }
    }
  }
  return { side, peak, lit, at };
}

function totalAlpha(image, rect) {
  let sum = 0;
  for (let y = rect.top; y < rect.bottom; y += 1) for (let x = rect.left; x < rect.right; x += 1) sum += image.data[(y * image.width + x) * 4 + 3];
  return sum;
}

// #endregion
// #region 02 — Analisi della cattura del Core

/**
 * Analizza una cattura. `geometry` in pixel dell'immagine: `canvas` (riquadro del canvas), `clip` (contenitore che
 * ritaglia, opzionale), `viewport`. Restituisce i problemi trovati (vuoto = nessun taglio) e i dettagli per lato.
 */
function analyzeCoreEdges(image, geometry, options = {}) {
  const settings = { ...EDGE_DEFAULTS, ...options };
  const viewport = geometry.viewport || { left: 0, top: 0, right: image.width, bottom: image.height };
  const canvas = innerRect(geometry.canvas, image);
  const visible = canvas && innerRect(intersect(geometry.canvas, geometry.clip || viewport, viewport) || { left: 0, top: 0, right: 0, bottom: 0 }, image);
  const problems = [];
  if (!canvas || !visible) return { problems: ['canvas del Core non visibile'], sides: [], total: 0 };
  const sides = ['left', 'top', 'right', 'bottom'].map((side) => {
    const stats = bandStats(image, visible, side, settings.depth, settings.maxAlpha);
    // Quale bordo è: del canvas stesso o dell'area che lo ritaglia (contenitore/finestra).
    const edge = { left: visible.left, top: visible.top, right: visible.right, bottom: visible.bottom }[side];
    // Confronto con il riquadro vero del canvas (non limitato all'immagine): fuori schermo il bordo è della finestra.
    const own = geometry.canvas[side];
    return { ...stats, boundary: Math.abs(edge - own) <= 1 ? 'canvas' : 'area visibile', edge };
  });
  for (const side of sides) {
    if (side.lit > settings.maxLitPixels) {
      problems.push(`particelle tagliate sul bordo ${side.side} (${side.boundary}, ${side.edge}px): ${side.lit} pixel con alpha > ${settings.maxAlpha}, picco ${side.peak} a ${side.at.x},${side.at.y}`);
    }
  }
  const total = totalAlpha(image, visible);
  // Una cattura vuota passerebbe qualunque controllo dei bordi: il Core deve essere davvero disegnato.
  if (total < settings.minTotalAlpha) problems.push(`Core quasi invisibile (alpha totale ${total})`);
  return { problems, sides, total, visible, canvas };
}

// #endregion

module.exports = { EDGE_DEFAULTS, analyzeCoreEdges, bandStats, innerRect, intersect };
