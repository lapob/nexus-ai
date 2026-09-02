/**
 * @module scripts/check-asvs-controls
 * @description Verifica che la mappa ASVS abbia prove e test reali, senza dichiarare certificazioni non svolte.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mapPath = path.join(root, 'config', 'asvs-5-controls.json');
const OFFICIAL_CHAPTERS = Object.freeze({
  V1: 'Encoding and Sanitization', V2: 'Validation and Business Logic', V3: 'Web Frontend Security',
  V4: 'API and Web Service', V5: 'File Handling', V6: 'Authentication', V7: 'Session Management',
  V8: 'Authorization', V9: 'Self-contained Tokens', V10: 'OAuth and OIDC', V11: 'Cryptography',
  V12: 'Secure Communication', V13: 'Configuration', V14: 'Data Protection',
  V15: 'Secure Coding and Architecture', V16: 'Security Logging and Error Handling', V17: 'WebRTC'
});

function inspectControls(map, projectRoot = root) {
  const failures = [];
  if (map?.standard !== 'OWASP ASVS 5.0.0' || !Array.isArray(map.controls) || !map.controls.length) failures.push('mappa ASVS non valida');
  const ids = new Set();
  for (const control of map?.controls || []) {
    if (!control.id || ids.has(control.id)) failures.push(`controllo duplicato o privo di id: ${control.id || '-'}`);
    ids.add(control.id);
    if (OFFICIAL_CHAPTERS[control.id] !== control.chapter) failures.push(`${control.id}: nome capitolo ASVS non ufficiale`);
    for (const field of ['evidence', 'tests']) {
      if (!Array.isArray(control[field]) || !control[field].length) failures.push(`${control.id}: ${field} mancante`);
      for (const relative of control[field] || []) {
        if (path.isAbsolute(relative) || relative.includes('..')) failures.push(`${control.id}: percorso non confinato ${relative}`);
        else if (!fs.existsSync(path.join(projectRoot, relative))) failures.push(`${control.id}: prova mancante ${relative}`);
      }
    }
  }
  const excluded = new Set();
  for (const item of map?.notApplicable || []) {
    if (!item.reason || item.reason.length < 20) failures.push(`${item.id || '-'}: esclusione non motivata`);
    if (OFFICIAL_CHAPTERS[item.id] !== item.chapter) failures.push(`${item.id || '-'}: nome capitolo escluso non ufficiale`);
    if (ids.has(item.id) || excluded.has(item.id)) failures.push(`${item.id || '-'}: capitolo duplicato`);
    excluded.add(item.id);
  }
  for (const id of Object.keys(OFFICIAL_CHAPTERS)) if (!ids.has(id) && !excluded.has(id)) failures.push(`${id}: capitolo non classificato`);
  return { passed: failures.length === 0, controls: ids.size, excluded: excluded.size, failures };
}

function main() {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const report = inspectControls(map);
  console.log(`ASVS evidence map: ${report.controls} capitoli coperti, ${report.excluded} non applicabili motivati, ${report.failures.length} errori.`);
  if (report.failures.length) {
    console.error(report.failures.map((entry) => `- ${entry}`).join('\n'));
    process.exitCode = 1;
  } else console.log('Mappa delle prove coerente. Non equivale a una certificazione esterna.');
}

if (require.main === module) main();
module.exports = { inspectControls, OFFICIAL_CHAPTERS };
