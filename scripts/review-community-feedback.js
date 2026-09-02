/**
 * @module scripts/review-community-feedback
 * @description Elenca o promuove esplicitamente contributi pubblici dalla quarantena al dataset approvato.
 */
const fs = require('node:fs');
const path = require('node:path');
const { TrainingStore, containsSensitiveMemory } = require('../src/infrastructure/storage/training-store');

const root = path.resolve(__dirname, '..');
const option = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const dataRoot = path.resolve(process.env.NEXUS_USER_DATA_ROOT || path.join(root, '..', '.nexus-data'));
const quarantinePath = path.resolve(option('quarantine') || path.join(dataRoot, 'data', 'database', 'community-feedback-quarantine.jsonl'));
const approvedPath = path.resolve(option('approved') || path.join(dataRoot, 'data', 'database', 'training-examples.jsonl'));
const requested = new Set(String(option('approve') || '').split(',').map((value) => value.trim()).filter(Boolean));
const reviewer = String(option('reviewer') || 'local-developer').replace(/[^a-z0-9._-]/gi, '').slice(0, 80) || 'local-developer';
const quarantine = new TrainingStore({ filePath: quarantinePath });
const approved = new TrainingStore({ filePath: approvedPath });
const records = quarantine.records({ limit: 1000 });

if (!requested.size) {
  const summary = records.map((record) => ({
    id: record.id,
    createdAt: record.createdAt,
    language: record.language || 'und',
    domain: record.domain || 'general',
    hasPreference: Boolean(record.originalResponse),
    consent: record.consent === true,
    reviewStatus: record.reviewStatus || 'quarantine'
  }));
  process.stdout.write(`${JSON.stringify({ quarantine: quarantinePath, pending: summary.length, records: summary }, null, 2)}\n`);
  process.exit(0);
}

const selected = records.filter((record) => requested.has(record.id));
if (selected.length !== requested.size) throw new Error('Uno o più ID richiesti non sono presenti nella quarantena.');
for (const record of selected) {
  if (record.consent !== true) throw new Error(`${record.id}: consenso verificabile assente.`);
  if (containsSensitiveMemory(record.prompt) || containsSensitiveMemory(record.response) || containsSensitiveMemory(record.originalResponse)) {
    throw new Error(`${record.id}: possibile contenuto sensibile; promozione bloccata.`);
  }
}

const promoted = [];
for (const record of selected) {
  const result = approved.append({
    requestId: record.requestId,
    prompt: record.prompt,
    response: record.response,
    originalResponse: record.originalResponse,
    model: record.model,
    mode: record.mode,
    language: record.language,
    domain: record.domain,
    provenance: 'reviewer-approved-community',
    reviewStatus: 'approved',
    license: 'community-opt-in-private-training',
    consent: true,
    reviewedBy: reviewer
  });
  promoted.push({ sourceId: record.id, approvedId: result.id });
}
quarantine.replace(records.filter((record) => !requested.has(record.id)));
process.stdout.write(`${JSON.stringify({ promoted: promoted.length, reviewer, records: promoted, remaining: records.length - promoted.length }, null, 2)}\n`);
