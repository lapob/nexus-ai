/**
 * @module scripts/benchmark-private-knowledge
 * @description Misura Hit@K del retrieval lessicale sulla knowledge privata o pubblica.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NexusIndex } = require('../src/knowledge/rag');

// #region Configurazione del benchmark

const vault = path.resolve(process.argv.find((arg) => arg.startsWith('--vault='))?.slice(8)
  || path.join(__dirname, '..', '..', '.knowledge-private'));
const profile = path.basename(vault) === '.knowledge-public' ? 'public' : 'private';
const minimum = Number(process.argv.find((arg) => arg.startsWith('--min-pass-rate='))?.split('=')[1] || 80);
const topK = Number(process.argv.find((arg) => arg.startsWith('--top-k='))?.split('=')[1] || 6);
const minimumMrr = Number(process.argv.find((arg) => arg.startsWith('--min-mrr='))?.split('=')[1] || 0.65);
const minimumCitationCoverage = Number(process.argv.find((arg) => arg.startsWith('--min-citation-coverage='))?.split('=')[1]
  || (profile === 'public' ? 85 : 0));
if (!fs.existsSync(vault)) throw new Error(`Knowledge ${profile} non trovata: ${vault}`);
const casesPath = path.resolve(process.argv.find((arg) => arg.startsWith('--cases='))?.slice(8)
  || path.join(__dirname, '..', 'config', `${profile}-knowledge-benchmark.json`));
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

// #endregion
// #region Esecuzione e gate

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-knowledge-benchmark-'));
try {
  const index = new NexusIndex(vault, { cachePath: path.join(temporary, 'index.json') });
  const stats = index.rebuild();
  const noteFiles = fs.readdirSync(vault, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name));
  const evidenceFor = (expectedPath) => {
    const normalized = expectedPath.replaceAll('\\', '/').toLocaleLowerCase('it-IT');
    const file = noteFiles.find((candidate) => path.relative(vault, candidate).replaceAll('\\', '/')
      .toLocaleLowerCase('it-IT').startsWith(normalized));
    if (!file) return { file: '', sourceUrls: [], sourceSection: false, contentSha256: '' };
    const text = fs.readFileSync(file, 'utf8');
    const sourceUrls = [...new Set(text.match(/https?:\/\/[^\s)>\]]+/g) || [])];
    const sourceSection = /^##\s+(?:Fonti|Riferimenti|Bibliografia|Sources)\b/mi.test(text);
    const contentSha256 = require('node:crypto').createHash('sha256').update(text).digest('hex');
    return { file: path.relative(vault, file).replaceAll('\\', '/'), sourceUrls, sourceSection, contentSha256 };
  };
  const results = cases.map((entry) => {
    const retrieved = index.search(entry.query, topK);
    const rank = retrieved.findIndex((item) => item.relativePath.startsWith(entry.expectedPath)) + 1;
    const evidence = evidenceFor(entry.expectedPath);
    const requiresSourceEvidence = entry.requiresSourceEvidence ?? profile === 'public';
    return {
      ...entry,
      pass: rank > 0,
      rank,
      reciprocalRank: rank > 0 ? 1 / rank : 0,
      citationReady: retrieved.every((item) => Boolean(item.relativePath && item.heading && item.sourceKind)),
      requiresSourceEvidence,
      sourceEvidence: Boolean(evidence.sourceSection && evidence.sourceUrls.length),
      evidence,
      matches: retrieved.map((item) => ({
        path: item.relativePath,
        heading: item.heading,
        sourceKind: item.sourceKind,
        score: Math.round(item.score * 1000) / 1000
      }))
    };
  });
  const passed = results.filter((entry) => entry.pass).length;
  const passRate = Math.round((passed / results.length) * 1000) / 10;
  const meanReciprocalRank = Math.round((results.reduce((total, entry) => total + entry.reciprocalRank, 0)
    / Math.max(1, results.length)) * 1000) / 1000;
  const citationReadyRate = Math.round((results.filter((entry) => entry.citationReady).length
    / Math.max(1, results.length)) * 1000) / 10;
  const evidenceCases = results.filter((entry) => entry.requiresSourceEvidence);
  const sourceEvidenceRate = evidenceCases.length
    ? Math.round((evidenceCases.filter((entry) => entry.sourceEvidence).length / evidenceCases.length) * 1000) / 10
    : null;
  const report = {
    evaluatedAt: new Date().toISOString(), vault, stats, topK, passed, total: results.length, passRate, minimum,
    meanReciprocalRank, minimumMrr, citationReadyRate, sourceEvidenceRate, minimumCitationCoverage, results
  };
  const output = path.join(__dirname, '..', 'qa-artifacts', `${profile}-knowledge-benchmark.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${profile === 'public' ? 'Public' : 'Private'} knowledge benchmark: ${passed}/${results.length}, Hit@${topK} ${passRate}%, MRR ${meanReciprocalRank}, citazioni ${citationReadyRate}%, fonti ${sourceEvidenceRate === null ? 'n/d' : `${sourceEvidenceRate}%`}.\n`);
  if (passRate < minimum || meanReciprocalRank < minimumMrr || citationReadyRate < 100
    || (sourceEvidenceRate !== null && sourceEvidenceRate < minimumCitationCoverage)) process.exitCode = 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

// #endregion
