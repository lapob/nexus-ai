/**
 * @module scripts/plan-model-training
 * @description Produce un piano ripetibile e blocca il fine-tuning quando il dataset non è maturo.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const factoryPolicy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'model-factory.json'), 'utf8'));
const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const directory = path.resolve(option('dataset') || path.join(root, 'developer-artifacts', 'training-dataset'));
const reportPath = path.join(directory, 'validation-report.json');
if (!fs.existsSync(reportPath)) throw new Error('Prima prepara e valida il dataset con npm run ai:dataset.');
const validation = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const minimum = Math.max(factoryPolicy.dataset.minimumSftExamples, Number(option('minimum') || factoryPolicy.dataset.minimumSftExamples));
const preferenceMinimum = Math.max(factoryPolicy.dataset.minimumDpoPreferences, Number(option('preference-minimum') || factoryPolicy.dataset.minimumDpoPreferences));
const ready = validation.ready === true && Number(validation.total) >= minimum;
const preferenceReady = validation.preferenceReady === true && Number(validation.preferencePairs) >= preferenceMinimum;
const plan = {
  schemaVersion: 2,
  candidateId: `${String(validation.datasetId || 'unversioned').slice(0, 12)}-qlora`,
  strategies: {
    supervised: { method: factoryPolicy.methods.supervised, ready },
    preference: { method: factoryPolicy.methods.preference, ready: preferenceReady }
  },
  baseModelPolicy: 'Selezionare il vincitore del benchmark locale, non il modello più grande per nome.',
  dataset: { examples: Number(validation.total) || 0, minimum, validationReport: path.relative(root, reportPath).replace(/\\/g, '/') },
  preferences: { pairs: Number(validation.preferencePairs) || 0, minimum: preferenceMinimum },
  gates: ['provenance-approved', 'no-secrets', 'evaluation-holdout-isolation', 'prompt-group-split-isolation', 'dataset-integrity-receipt', 'fresh-canary-evaluation', 'baseline-evaluation', 'post-training-regression', 'security-must-pass', 'human-approval'],
  promotion: {
    policy: 'Il candidato viene promosso soltanto se non regredisce rispetto alla baseline e tutti i casi must-pass restano verdi.',
    rollback: 'Conservare modello base, adapter precedente, manifest dataset e report eval; il catalogo attivo cambia soltanto dopo approvazione.'
  },
  ready,
  next: ready
    ? (preferenceReady ? 'Eseguire SFT e DPO in un ambiente Python isolato, quindi confrontare il candidato con la baseline.' : 'Eseguire soltanto SFT isolato; DPO resta bloccato fino a preferenze sufficienti.')
    : `Raccogliere almeno ${minimum - (Number(validation.total) || 0)} esempi approvati aggiuntivi.`
};
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
if (!ready) process.exitCode = 2;
