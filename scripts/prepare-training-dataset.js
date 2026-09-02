/**
 * @module scripts/prepare-training-dataset
 * @description Esporta esempi approvati in split riproducibili senza addestrare o pubblicare automaticamente.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  TrainingStore,
  classifyTrainingDomain,
  containsSensitiveMemory,
  detectTrainingLanguage,
  exampleFingerprint,
  promptFingerprint
} = require('../src/infrastructure/storage/training-store');

// #region Percorsi e split

const root = path.resolve(__dirname, '..');
const factoryPolicy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'model-factory.json'), 'utf8'));
const datasetPolicy = factoryPolicy.dataset;
const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const developmentDataRoot = path.resolve(process.env.NEXUS_USER_DATA_ROOT || path.join(root, '..', '.nexus-data'));
const input = path.resolve(option('input') || path.join(developmentDataRoot, 'data', 'database', 'training-examples.jsonl'));
const output = path.resolve(option('output') || path.join(root, 'developer-artifacts', 'training-dataset'));
const evaluationPromptFingerprints = () => {
  const directory = path.join(root, 'config', 'evals');
  if (!fs.existsSync(directory)) return new Set();
  const prompts = [];
  for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const suite = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    for (const item of suite.cases || []) {
      if (item.prompt) prompts.push(item.prompt);
      for (const message of item.messages || []) if (message?.role === 'user') prompts.push(message.content);
    }
  }
  return new Set(prompts.map((prompt) => promptFingerprint({ prompt })));
};
const splitFor = (record) => {
  // Tutte le varianti della stessa domanda restano nello stesso split: una
  // correzione non può diventare involontariamente la risposta del test.
  const bucket = Number.parseInt(crypto.createHash('sha256').update(promptFingerprint(record)).digest('hex').slice(0, 8), 16) % 100;
  return bucket < 80 ? 'train' : bucket < 90 ? 'validation' : 'test';
};
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

// #endregion
// #region Validazione ed esportazione

const approvedRecords = new TrainingStore({ filePath: input }).records({ limit: 1000 })
  .filter((record) => ['user-approved-conversation', 'reviewer-approved-community'].includes(record.provenance))
  .filter((record) => record.reviewStatus !== 'quarantine')
  .filter((record) => !containsSensitiveMemory(record.prompt) && !containsSensitiveMemory(record.response));
const benchmarkPrompts = evaluationPromptFingerprints();
const records = approvedRecords.filter((record) => !benchmarkPrompts.has(promptFingerprint(record)));
const excludedBenchmarkOverlap = approvedRecords.length - records.length;
const unique = [...new Map(records.map((record) => [exampleFingerprint(record), record])).values()];
const splits = { train: [], validation: [], test: [] };
const preferenceSplits = { train: [], validation: [], test: [] };
for (const record of unique) {
  const split = splitFor(record);
  const metadata = {
    provenance: record.provenance,
    license: record.license || 'user-approved-private-use',
    confidence: record.confidence,
    verifiedAt: record.verifiedAt,
    mode: record.mode,
    language: record.language || detectTrainingLanguage(record.prompt),
    domain: record.domain || classifyTrainingDomain(record.prompt)
  };
  splits[split].push({
    id: record.id,
    messages: [
      { role: 'system', content: 'Sei NEXUSNXS. Rispondi in modo corretto, naturale, verificabile e proporzionato.' },
      { role: 'user', content: String(record.prompt) },
      { role: 'assistant', content: String(record.response) }
    ],
    metadata
  });
  if (record.originalResponse
    && String(record.originalResponse).trim() !== String(record.response).trim()
    && !containsSensitiveMemory(record.originalResponse)) {
    preferenceSplits[split].push({
      id: record.id,
      prompt: [{ role: 'user', content: String(record.prompt) }],
      chosen: [{ role: 'assistant', content: String(record.response) }],
      rejected: [{ role: 'assistant', content: String(record.originalResponse) }],
      metadata
    });
  }
}
fs.mkdirSync(output, { recursive: true });
const writtenFiles = {};
for (const [name, rows] of Object.entries(splits)) {
  const content = rows.map(JSON.stringify).join('\n') + (rows.length ? '\n' : '');
  const fileName = `${name}.jsonl`;
  fs.writeFileSync(path.join(output, fileName), content);
  writtenFiles[fileName] = { examples: rows.length, sha256: digest(content) };
}
for (const [name, rows] of Object.entries(preferenceSplits)) {
  const content = rows.map(JSON.stringify).join('\n') + (rows.length ? '\n' : '');
  const fileName = `preference-${name}.jsonl`;
  fs.writeFileSync(path.join(output, fileName), content);
  writtenFiles[fileName] = { examples: rows.length, sha256: digest(content) };
}
const datasetId = digest(unique.map((record) => JSON.stringify({
  fingerprint: exampleFingerprint(record),
  rejected: String(record.originalResponse || ''),
  provenance: record.provenance,
  license: record.license || 'user-approved-private-use',
  language: record.language || detectTrainingLanguage(record.prompt),
  domain: record.domain || classifyTrainingDomain(record.prompt),
  verifiedAt: record.verifiedAt || ''
})).sort().join('\n'));
const domains = Object.fromEntries([...new Set(unique.map((record) => record.domain || classifyTrainingDomain(record.prompt)))]
  .sort().map((domain) => [domain, unique.filter((record) => (record.domain || classifyTrainingDomain(record.prompt)) === domain).length]));
const languages = Object.fromEntries([...new Set(unique.map((record) => record.language || detectTrainingLanguage(record.prompt)))]
  .sort().map((language) => [language, unique.filter((record) => (record.language || detectTrainingLanguage(record.prompt)) === language).length]));
const manifest = {
  schemaVersion: 2,
  datasetId,
  generatedAt: new Date().toISOString(),
  source: 'approved-feedback',
  sources: [...new Set(unique.map((row) => row.provenance))].sort(),
  licenses: [...new Set(unique.map((row) => row.license))].sort(),
  transformations: ['secret-filter', 'evaluation-holdout-filter', 'exact-deduplication', 'prompt-grouped-deterministic-split'],
  excludedBenchmarkOverlap,
  total: unique.length,
  splits: Object.fromEntries(Object.entries(splits).map(([name, rows]) => [name, rows.length])),
  preferencePairs: Object.values(preferenceSplits).reduce((sum, rows) => sum + rows.length, 0),
  preferenceSplits: Object.fromEntries(Object.entries(preferenceSplits).map(([name, rows]) => [name, rows.length])),
  domains,
  languages,
  files: writtenFiles,
  readyForFineTuning: unique.length >= datasetPolicy.minimumSftExamples
    && splits.validation.length >= datasetPolicy.minimumValidationExamples
    && splits.test.length >= datasetPolicy.minimumTestExamples,
  readyForPreferenceTuning: Object.values(preferenceSplits).reduce((sum, rows) => sum + rows.length, 0) >= datasetPolicy.minimumDpoPreferences
    && preferenceSplits.validation.length >= datasetPolicy.minimumPreferenceValidationExamples
    && preferenceSplits.test.length >= datasetPolicy.minimumPreferenceTestExamples,
  minimumRecommendedExamples: datasetPolicy.minimumSftExamples,
  minimumRecommendedPreferences: datasetPolicy.minimumDpoPreferences,
  notes: 'Gli split validation e test non devono essere usati durante il training. Il manifest contiene checksum, non una firma di identità.'
};
fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const receipt = {
  schemaVersion: 1,
  datasetId,
  manifestSha256: digest(`${JSON.stringify(manifest, null, 2)}\n`),
  files: writtenFiles
};
fs.writeFileSync(path.join(output, 'integrity-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`Dataset NexusNXS ${datasetId.slice(0, 12)}: ${unique.length} esempi approvati · ${manifest.preferencePairs} preferenze · train ${splits.train.length} · validation ${splits.validation.length} · test ${splits.test.length}.\n`);
if (!manifest.readyForFineTuning) process.stdout.write(`Fine-tuning non ancora consigliato: servono almeno ${manifest.minimumRecommendedExamples} esempi diversi e split di valutazione sufficienti.\n`);

// #endregion
