/**
 * @module scripts/visual/selftest
 * @description Prova che la regressione visiva fallisce davvero. Copia web-dist in qa-artifacts/visual-selftest,
 * vi reintroduce apposta due difetti nella build compilata (i sorgenti non vengono toccati) e pretende che le
 * suite li segnalino:
 *  1. "box invisibile": nucleo grande come nella vecchia versione (SPREAD 1) e nessuna sfumatura verso i bordi →
 *     il controllo geometrico deve trovare particelle tagliate su una retta;
 *  2. composer spostato di 6 px → il confronto con le baseline deve fallire.
 * Esce con 0 solo se entrambi i difetti vengono rilevati. Uso: npm run qa:visual:selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = path.join(root, 'web-dist');
const target = path.join(root, 'qa-artifacts', 'visual-selftest', 'dist');

/** Sostituzioni sulla build compilata. Ognuna deve applicarsi: se la build cambia forma, l'autoverifica lo dice. */
export const SABOTAGE = [
  // Shader WebGPU: nucleo a scala piena del canvas e particelle sempre a piena luce fino al bordo.
  { file: /\.js$/, what: 'scala del nucleo (SPREAD 1)', from: '${(1.9/2).toFixed(3)}*u.scale', to: '${(1.9).toFixed(3)}*u.scale' },
  { file: /\.js$/, what: 'sfumatura WebGPU', from: /let fd=\(1\.-smoothstep\(\.56,\.97,[^;]*;/, to: 'let fd=1.;' },
  // Canvas 2D: stesso difetto (raggio doppio, nessuna dissolvenza).
  { file: /\.js$/, what: 'raggio Canvas 2D', from: /(=\w+\*\.6)\/2(\*\w+,)/, to: '$1/1$2' },
  { file: /\.js$/, what: 'sfumatura Canvas 2D', from: /=\(\w+,\w+\)=>\(1-\w+\(\.56,\.97,/, to: (match) => `${match.slice(0, match.indexOf('(1-'))}0*0+1||(1-${match.slice(match.indexOf('(1-') + 3)}` },
  // Interfaccia: composer spostato di 6 px.
  { file: /\.css$/, what: 'composer spostato', from: /$/, to: '\n.composer{translate:0 6px}\n' }
];

function sabotage() {
  fs.rmSync(path.dirname(target), { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  const assets = path.join(target, 'assets');
  const applied = new Set();
  for (const name of fs.readdirSync(assets)) {
    let text = null;
    for (const rule of SABOTAGE) {
      if (!rule.file.test(name)) continue;
      text ??= fs.readFileSync(path.join(assets, name), 'utf8');
      const next = text.replace(rule.from, rule.to);
      if (next !== text) { applied.add(rule.what); text = next; }
    }
    if (text !== null) fs.writeFileSync(path.join(assets, name), text);
  }
  const missing = SABOTAGE.filter((rule) => !applied.has(rule.what)).map((rule) => rule.what);
  if (missing.length) throw new Error(`difetto non applicabile alla build attuale: ${missing.join(', ')}`);
}

function run(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'visual', 'run-web.mjs'), `--dist=${target}`, '--tag=selftest', ...args],
    { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

if (!fs.existsSync(path.join(source, 'index.html'))) { console.error('web-dist assente: eseguire npm run build:web.'); process.exit(2); }
sabotage();
const checks = [
  { what: 'particelle tagliate (box invisibile)', args: ['--suite=core', '--only=canvas2d-hero-390,webgpu-hero-390,canvas2d-ambiente-1024'], expect: /particelle tagliate sul bordo/ },
  { what: 'composer spostato', args: ['--suite=web', '--only=home-1440-dark,conversation-390-dark'], expect: /✖ web \S+ fail/ }
];
let ok = true;
for (const check of checks) {
  const { status, output } = run(check.args);
  const detected = status === 1 && check.expect.test(output);
  ok &&= detected;
  console.log(`${detected ? '✔' : '✖'} ${check.what}: ${detected ? 'rilevato' : 'NON rilevato'} (uscita ${status})`);
  if (!detected) console.log(output.split('\n').slice(-25).join('\n'));
  else console.log(output.split('\n').filter((line) => /particelle tagliate|✖ web/.test(line)).slice(0, 4).map((line) => `    ${line.trim()}`).join('\n'));
}
fs.rmSync(path.dirname(target), { recursive: true, force: true });
console.log(ok ? '\nAutoverifica superata: la regressione visiva fallisce sui difetti reali.' : '\nAutoverifica FALLITA: un difetto passerebbe inosservato.');
process.exit(ok ? 0 : 1);
