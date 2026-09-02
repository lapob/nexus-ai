/**
 * @module scripts/validate-training-dataset
 * @description Verifica schema, isolamento degli split, provenienza e integrità del dataset privato.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { containsSensitiveMemory } = require('../src/infrastructure/storage/training-store');

const root = path.resolve(__dirname, '..');
const factoryPolicy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'model-factory.json'), 'utf8'));
const datasetPolicy = factoryPolicy.dataset;
const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const directory = path.resolve(option('dataset') || path.join(root, 'developer-artifacts', 'training-dataset'));
const required = ['train', 'validation', 'test'];
const seen = new Map();
const promptSplits = new Map();
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const normalized = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const report = { schemaVersion: 2, checkedAt: new Date().toISOString(), dataset: path.basename(directory), splits: {}, preferenceSplits: {}, ready: false, preferenceReady: false };
const evaluationPrompts = new Set();
const evaluationDirectory = path.join(root, 'config', 'evals');
if (fs.existsSync(evaluationDirectory)) {
  for (const name of fs.readdirSync(evaluationDirectory).filter((entry) => entry.endsWith('.json'))) {
    const suite = JSON.parse(fs.readFileSync(path.join(evaluationDirectory, name), 'utf8'));
    for (const item of suite.cases || []) {
      if (item.prompt) evaluationPrompts.add(normalized(item.prompt));
      for (const message of item.messages || []) if (message?.role === 'user') evaluationPrompts.add(normalized(message.content));
    }
  }
}

// #region Dataset supervisionato e isolamento degli split

for (const split of required) {
  const file = path.join(directory, `${split}.jsonl`);
  if (!fs.existsSync(file)) throw new Error(`Split mancante: ${split}.jsonl`);
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`${split}.jsonl:${index + 1} non è JSON valido.`); }
  });
  for (const [index, row] of rows.entries()) {
    const messages = Array.isArray(row.messages) ? row.messages : [];
    const user = messages.find((message) => message?.role === 'user')?.content;
    const assistant = messages.find((message) => message?.role === 'assistant')?.content;
    if (!row.id || typeof user !== 'string' || typeof assistant !== 'string' || !user.trim() || !assistant.trim()) {
      throw new Error(`${split}.jsonl:${index + 1} non rispetta lo schema conversazionale.`);
    }
    if (!['user-approved-conversation', 'reviewer-approved-community'].includes(row.metadata?.provenance)) throw new Error(`${split}.jsonl:${index + 1} non ha provenienza approvata.`);
    if (containsSensitiveMemory(user) || containsSensitiveMemory(assistant)) throw new Error(`${split}.jsonl:${index + 1} contiene dati potenzialmente sensibili.`);
    if (evaluationPrompts.has(normalized(user))) throw new Error(`${split}.jsonl:${index + 1} contamina un prompt di valutazione.`);
    const promptHash = digest(normalized(user));
    if (promptSplits.has(promptHash) && promptSplits.get(promptHash) !== split) throw new Error(`Contaminazione prompt tra split: ${promptSplits.get(promptHash)} e ${split}.`);
    promptSplits.set(promptHash, split);
    const fingerprint = digest(`${normalized(user)}\n${normalized(assistant)}`);
    if (seen.has(fingerprint)) throw new Error(`Contaminazione tra split: esempio presente in ${seen.get(fingerprint)} e ${split}.`);
    seen.set(fingerprint, split);
  }
  report.splits[split] = {
    examples: rows.length,
    sha256: digest(fs.readFileSync(file))
  };
}

// #endregion
// #region Preferenze DPO

let preferenceTotal = 0;
for (const split of required) {
  const file = path.join(directory, `preference-${split}.jsonl`);
  if (!fs.existsSync(file)) throw new Error(`Split preferenze mancante: preference-${split}.jsonl`);
  const content = fs.readFileSync(file, 'utf8');
  const rows = content.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`preference-${split}.jsonl:${index + 1} non è JSON valido.`); }
  });
  for (const [index, row] of rows.entries()) {
    const prompt = row.prompt?.find?.((message) => message?.role === 'user')?.content;
    const chosen = row.chosen?.find?.((message) => message?.role === 'assistant')?.content;
    const rejected = row.rejected?.find?.((message) => message?.role === 'assistant')?.content;
    if (!row.id || !String(prompt || '').trim() || !String(chosen || '').trim() || !String(rejected || '').trim()) {
      throw new Error(`preference-${split}.jsonl:${index + 1} non rispetta lo schema DPO.`);
    }
    if (normalized(chosen) === normalized(rejected)) throw new Error(`preference-${split}.jsonl:${index + 1} non distingue chosen e rejected.`);
    if (!['user-approved-conversation', 'reviewer-approved-community'].includes(row.metadata?.provenance)) throw new Error(`preference-${split}.jsonl:${index + 1} non ha provenienza approvata.`);
    if (containsSensitiveMemory(prompt) || containsSensitiveMemory(chosen) || containsSensitiveMemory(rejected)) {
      throw new Error(`preference-${split}.jsonl:${index + 1} contiene dati potenzialmente sensibili.`);
    }
    const promptHash = digest(normalized(prompt));
    if (promptSplits.get(promptHash) !== split) throw new Error(`Preferenza associata allo split errato: ${split}.`);
  }
  preferenceTotal += rows.length;
  report.preferenceSplits[split] = { examples: rows.length, sha256: digest(content) };
}

// #endregion
// #region Manifest e ricevuta di integrità

const manifestPath = path.join(directory, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error('Manifest del dataset mancante.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 2 || !/^[a-f0-9]{64}$/.test(String(manifest.datasetId || ''))) throw new Error('Manifest dataset v2 non valido.');
for (const split of required) if (Number(manifest.splits?.[split]) !== report.splits[split].examples) throw new Error(`Conteggio ${split} incoerente con il manifest.`);
for (const split of required) if (Number(manifest.preferenceSplits?.[split]) !== report.preferenceSplits[split].examples) throw new Error(`Conteggio preferenze ${split} incoerente con il manifest.`);
report.total = seen.size;
report.preferencePairs = preferenceTotal;
report.ready = report.total >= datasetPolicy.minimumSftExamples
  && report.splits.validation.examples >= datasetPolicy.minimumValidationExamples
  && report.splits.test.examples >= datasetPolicy.minimumTestExamples;
report.preferenceReady = preferenceTotal >= datasetPolicy.minimumDpoPreferences
  && report.preferenceSplits.validation.examples >= datasetPolicy.minimumPreferenceValidationExamples
  && report.preferenceSplits.test.examples >= datasetPolicy.minimumPreferenceTestExamples;
report.thresholds = datasetPolicy;
report.datasetId = manifest.datasetId;
report.manifestSha256 = digest(fs.readFileSync(manifestPath));
for (const [fileName, descriptor] of Object.entries(manifest.files || {})) {
  const file = path.join(directory, fileName);
  if (!fs.existsSync(file) || digest(fs.readFileSync(file)) !== descriptor.sha256) throw new Error(`Integrità non valida: ${fileName}.`);
}
const receiptPath = path.join(directory, 'integrity-receipt.json');
if (!fs.existsSync(receiptPath)) throw new Error('Ricevuta di integrità mancante.');
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
if (receipt.datasetId !== manifest.datasetId || receipt.manifestSha256 !== report.manifestSha256) throw new Error('Ricevuta di integrità incoerente.');
fs.writeFileSync(path.join(directory, 'validation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Dataset verificato: ${report.total} esempi unici · ${preferenceTotal} preferenze · SFT ${report.ready ? 'abilitabile' : 'bloccato'} · DPO ${report.preferenceReady ? 'abilitabile' : 'bloccato'}.\n`);

// #endregion
