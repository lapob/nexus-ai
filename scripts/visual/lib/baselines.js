/**
 * @module scripts/visual/lib/baselines
 * @description Baseline approvate e rapporto HTML della regressione visiva. Ogni suite (web, core, site, android)
 * confronta le catture con `qa-artifacts/visual-baselines/<suite>/` e scrive in `qa-artifacts/visual-runs/<suite>/`
 * le catture attuali, le differenze e `report.html`. Le baseline cambiano solo con un'approvazione esplicita
 * (`--update` o `npm run qa:visual:approve`), mai da sole durante un confronto.
 */
const fs = require('node:fs');
const path = require('node:path');
const { compareImages } = require('./diff');
const { decode, encode } = require('./png');

// #region 01 — Percorsi e suite di confronto

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/;

function paths(root, suite, runName = suite) {
  if (!SAFE_NAME.test(suite) || !SAFE_NAME.test(runName)) throw new Error(`nome suite non valido: ${suite}/${runName}`);
  const run = path.join(root, 'qa-artifacts', 'visual-runs', runName);
  return { baselines: path.join(root, 'qa-artifacts', 'visual-baselines', suite), run,
    actual: path.join(run, 'actual'), expected: path.join(run, 'expected'), diff: path.join(run, 'diff'),
    report: path.join(run, 'report.html'), results: path.join(run, 'results.json') };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/** Crea una suite. `update` approva direttamente le catture correnti (uso intenzionale). */
function createSuite({ root, suite, runName = suite, update = false, defaults = {} }) {
  const dirs = paths(root, suite, runName);
  fs.rmSync(dirs.run, { recursive: true, force: true });
  for (const dir of [dirs.actual, dirs.expected, dirs.diff]) fs.mkdirSync(dir, { recursive: true });
  if (update) fs.mkdirSync(dirs.baselines, { recursive: true });
  const results = [];
  const started = new Date();

  function record(entry) { results.push(entry); return entry; }

  return {
    dirs,
    /** Confronta una cattura PNG con la baseline omonima. */
    check(name, bytes, options = {}) {
      if (!SAFE_NAME.test(name)) throw new Error(`nome cattura non valido: ${name}`);
      const file = `${name}.png`;
      const png = Buffer.isBuffer(bytes) ? bytes : encode(bytes);
      fs.writeFileSync(path.join(dirs.actual, file), png);
      const baseline = path.join(dirs.baselines, file);
      if (update) {
        fs.copyFileSync(path.join(dirs.actual, file), baseline);
        return record({ name, status: 'approved', note: options.note || '' });
      }
      if (!fs.existsSync(baseline)) return record({ name, status: 'missing', note: 'baseline assente: approvare dopo revisione' });
      fs.copyFileSync(baseline, path.join(dirs.expected, file));
      const result = compareImages(decode(fs.readFileSync(baseline)), decode(png), { ...defaults, ...options });
      if (result.image && result.diffPixels > 0) fs.writeFileSync(path.join(dirs.diff, file), encode(result.image));
      return record({ name, status: result.pass ? 'pass' : 'fail', diffPixels: result.diffPixels, diffRatio: result.diffRatio,
        box: result.box, detail: result.detail || '', limit: { ...defaults, ...options }.maxDiffRatio, note: options.note || '' });
    },
    /** Esito di un controllo non pixel-per-pixel (es. bordi del Core), con la cattura che lo dimostra. */
    assert(name, problems, bytes, note = '') {
      if (bytes) fs.writeFileSync(path.join(dirs.actual, `${name}.png`), Buffer.isBuffer(bytes) ? bytes : encode(bytes));
      return record({ name, status: problems.length ? 'fail' : 'pass', problems, note, kind: 'assert', image: Boolean(bytes) });
    },
    /** Scrive results.json e report.html; restituisce il numero di fallimenti (baseline mancanti incluse). */
    finish(meta = {}) {
      const failed = results.filter((item) => item.status === 'fail' || item.status === 'missing');
      const payload = { suite, startedAt: started.toISOString(), finishedAt: new Date().toISOString(), update, meta, results };
      fs.writeFileSync(dirs.results, `${JSON.stringify(payload, null, 2)}\n`);
      fs.writeFileSync(dirs.report, renderReport(payload));
      return { failed: failed.length, total: results.length, report: dirs.report, results };
    }
  };
}

// #endregion
// #region 02 — Rapporto HTML e approvazione

function renderReport({ suite, startedAt, update, meta, results }) {
  const order = { fail: 0, missing: 1, pass: 2, approved: 3 };
  const rows = [...results].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(['fail', 'missing', 'pass', 'approved'].map((key) => [key, results.filter((item) => item.status === key).length]));
  const img = (dir, name, label) => `<figure><figcaption>${label}</figcaption><a href="${dir}/${encodeURIComponent(name)}.png"><img loading="lazy" src="${dir}/${encodeURIComponent(name)}.png" alt="${escapeHtml(`${label} ${name}`)}"></a></figure>`;
  const body = rows.map((item) => {
    const figures = item.kind === 'assert'
      ? (item.image ? img('actual', item.name, 'cattura') : '')
      : [item.status === 'missing' || item.status === 'approved' ? '' : img('expected', item.name, 'baseline'), img('actual', item.name, 'attuale'),
        item.diffPixels > 0 && Number.isFinite(item.diffPixels) ? img('diff', item.name, 'differenze') : ''].join('');
    const metric = item.kind === 'assert' ? (item.problems.length ? `<ul>${item.problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : 'nessun problema')
      : item.status === 'missing' || item.status === 'approved' ? escapeHtml(item.note || item.status)
        : `${(item.diffRatio * 100).toFixed(3)}% (${item.diffPixels} px) · limite ${(item.limit * 100).toFixed(2)}%${item.detail ? ` · ${escapeHtml(item.detail)}` : ''}`;
    return `<section class="row" data-status="${item.status}"><header><span class="badge">${item.status}</span><h2>${escapeHtml(item.name)}</h2><p>${metric}</p></header><div class="figures">${figures}</div></section>`;
  }).join('\n');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Regressione visiva · ${escapeHtml(suite)}</title><style>
:root{color-scheme:dark;--bg:#05080a;--fg:#e6f6f6;--muted:#8aa0a3;--line:#16252a;--fail:#ff4d6d;--pass:#4be3c1;--warn:#f5c26b}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 Inter,system-ui,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:1600px;margin:0 auto;padding:24px 16px}h1{font-weight:600;font-size:22px;margin:0 0 4px}.meta{color:var(--muted);margin:0 0 20px}
.summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}.summary span{border:1px solid var(--line);border-radius:999px;padding:4px 12px}
.row{border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px}.row header{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.row h2{font-size:15px;margin:0;font-weight:600}.row p,.row ul{margin:0;color:var(--muted)}.badge{border-radius:999px;padding:1px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
[data-status=fail] .badge{background:var(--fail);color:#000}[data-status=missing] .badge{background:var(--warn);color:#000}[data-status=pass] .badge,[data-status=approved] .badge{background:var(--pass);color:#000}
.figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:10px}figure{margin:0}figcaption{color:var(--muted);font-size:12px;margin-bottom:4px}
img{width:100%;height:auto;border-radius:8px;border:1px solid var(--line);background:repeating-conic-gradient(#0d1417 0 25%,#091013 0 50%) 0 0/16px 16px}
</style></head><body><main><h1>Regressione visiva · ${escapeHtml(suite)}</h1>
<p class="meta">${escapeHtml(startedAt)}${update ? ' · baseline aggiornate (approvazione esplicita)' : ''}${Object.entries(meta).map(([k, v]) => ` · ${escapeHtml(k)}: ${escapeHtml(v)}`).join('')}</p>
<div class="summary"><span>falliti ${counts.fail}</span><span>senza baseline ${counts.missing}</span><span>superati ${counts.pass}</span>${counts.approved ? `<span>approvati ${counts.approved}</span>` : ''}</div>
${body}</main></body></html>\n`;
}

/**
 * Approva le catture dell'ultima esecuzione: copia `visual-runs/<suite>/actual/*.png` nelle baseline.
 * `only` limita ai nomi indicati (o che iniziano con un prefisso seguito da `*`).
 */
function approve({ root, suite, only = [] }) {
  const dirs = paths(root, suite);
  if (!fs.existsSync(dirs.results)) throw new Error(`nessuna esecuzione per ${suite}: lanciare prima la suite e rivedere ${path.relative(root, dirs.report)}`);
  const matches = (name) => !only.length || only.some((pattern) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern);
  const { results } = JSON.parse(fs.readFileSync(dirs.results, 'utf8'));
  // Solo i confronti pixel: le catture dei controlli geometrici non sono baseline.
  const names = results.filter((item) => item.kind !== 'assert' && matches(item.name)).map((item) => item.name);
  fs.mkdirSync(dirs.baselines, { recursive: true });
  for (const name of names) fs.copyFileSync(path.join(dirs.actual, `${name}.png`), path.join(dirs.baselines, `${name}.png`));
  return names;
}

// #endregion

module.exports = { approve, createSuite, escapeHtml, paths, renderReport };
