/**
 * @module ai/native-runtime-security
 * @description Ammissione nativa vincolata a inventario, modello e revisione fidata nel sorgente.
 */
const fs = require('node:fs');
const path = require('node:path');
const { hashFile, inspectNativeRuntime } = require('./native-runtime-inventory');

// #region 01 — Policy fidata, distinta dai report generati o dalla configurazione utente

// Aggiungere una release solo dopo provenienza e revisione completa delle dipendenze.
// Nessun report locale, variabile ambiente o risultato Grype può popolare questa lista.
const ADMITTED_RELEASES = Object.freeze([]);
const ADMITTED_MODELS = Object.freeze([]);
const DIGEST = /^[a-f0-9]{64}$/u;

function reject(code) { throw Object.assign(new Error('Ammissione del runtime nativo non soddisfatta.'), { code }); }

function approvedRelease(inventory, releases, usage, now) {
  const release = releases.find(item => item.inventorySha256 === inventory.inventorySha256
    && item.executable === inventory.executable && item.usages?.includes(usage));
  if (!release) reject('NATIVE_RELEASE_NOT_REVIEWED');
  if (!DIGEST.test(release.archiveSha256 || '') || !/^[a-f0-9]{40}$/u.test(release.sourceCommit || '')) {
    reject('NATIVE_PROVENANCE_INCOMPLETE');
  }
  const review = release.review;
  const reviewedAt = Date.parse(review?.reviewedAt), expiresAt = Date.parse(review?.expiresAt);
  if (review?.status !== 'approved' || !Number.isFinite(reviewedAt) || !Number.isFinite(expiresAt)
    || reviewedAt > now || expiresAt <= now || expiresAt <= reviewedAt
    || expiresAt - reviewedAt > 30 * 86400000) reject('NATIVE_REVIEW_MISSING_OR_STALE');
  if (review.coverage !== 'files-embedded-dynamic-host' || !Array.isArray(review.components) || !review.components.length
    || !Array.isArray(review.blockingFindings) || review.blockingFindings.length) reject('NATIVE_DEPENDENCY_REVIEW_INCOMPLETE');
  for (const component of review.components) {
    if (!component.name || !component.version || !DIGEST.test(component.evidenceSha256 || '')) {
      reject('NATIVE_DEPENDENCY_REVIEW_INCOMPLETE');
    }
  }
  const allowed = release.externalImports;
  if (!Array.isArray(allowed) || allowed.length !== new Set(allowed).size
    || JSON.stringify([...allowed].sort()) !== JSON.stringify(inventory.externalImports)) reject('NATIVE_IMPORT_COVERAGE_INCOMPLETE');
  return release;
}

// #endregion

// #region 02 — Verifica a ogni avvio, prima dello spawn e senza eseguire il binario

async function verifyReviewedFile(target, expected, signal, errorCode) {
  const before = await fs.promises.stat(target, { bigint: true });
  if (!before.isFile() || before.size !== BigInt(expected.bytes) || await hashFile(target, signal) !== expected.sha256) reject(errorCode);
  const after = await fs.promises.stat(target, { bigint: true });
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ino !== after.ino) reject(errorCode);
}

async function verifyHostFiles(release, hostDirectory, signal) {
  if (!path.isAbsolute(hostDirectory || '') || !Array.isArray(release.hostFiles) || !release.hostFiles.length) {
    reject('NATIVE_HOST_REVIEW_INCOMPLETE');
  }
  const root = await fs.promises.realpath(hostDirectory), imported = [], seen = new Set();
  for (const file of release.hostFiles) {
    if (!/^[a-z0-9_./\\-]+$/iu.test(file.path || '') || path.isAbsolute(file.path) || /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(file.path)
      || !DIGEST.test(file.sha256 || '') || !Array.isArray(file.imports) || !Number.isSafeInteger(file.bytes) || file.bytes < 1) {
      reject('NATIVE_HOST_REVIEW_INCOMPLETE');
    }
    const target = await fs.promises.realpath(path.join(root, file.path)), relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || seen.has(target)) reject('NATIVE_HOST_SCOPE_INVALID');
    seen.add(target); imported.push(...file.imports);
    await verifyReviewedFile(target, file, signal, 'NATIVE_HOST_INTEGRITY_FAILED');
  }
  if (imported.length !== new Set(imported).size
    || JSON.stringify(imported.sort()) !== JSON.stringify([...release.externalImports].sort())) reject('NATIVE_HOST_REVIEW_INCOMPLETE');
}

function createNativeRuntimeSecurityCheck({ releases = ADMITTED_RELEASES, models = ADMITTED_MODELS,
  clock = Date.now, platform = process.platform,
  hostDirectory = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32') : '' } = {}) {
  // Copia profonda: chi modifica l'oggetto originale dopo la costruzione non cambia la policy.
  const trustedReleases = structuredClone(releases), trustedModels = structuredClone(models);
  return async (executablePath, { usage = 'distribution', host, modelPath, model, signal } = {}) => {
    signal?.throwIfAborted();
    if (platform !== 'win32' || host !== '127.0.0.1' || !['evaluation', 'distribution'].includes(usage)
      || !path.isAbsolute(executablePath || '') || !path.isAbsolute(modelPath || '')) reject('NATIVE_SCOPE_INVALID');
    const executable = await fs.promises.realpath(executablePath), canonicalModel = await fs.promises.realpath(modelPath);
    const inventory = await inspectNativeRuntime(executable, { signal });
    const release = approvedRelease(inventory, trustedReleases, usage, clock());
    await verifyHostFiles(release, hostDirectory, signal);
    const candidate = trustedModels.find(item => item.alias === model && item.usages?.includes(usage)
      && DIGEST.test(item.sha256 || ''));
    if (!candidate || !Number.isSafeInteger(candidate.bytes) || candidate.bytes < 1) reject('NATIVE_MODEL_NOT_REVIEWED');
    await verifyReviewedFile(canonicalModel, candidate, signal, 'NATIVE_MODEL_INTEGRITY_FAILED');
    signal?.throwIfAborted();
    return Object.freeze({ admitted: true, executablePath: executable, modelPath: canonicalModel, model, usage,
      inventorySha256: inventory.inventorySha256, archiveSha256: release.archiveSha256 });
  };
}

const assertNativeRuntimeSecure = createNativeRuntimeSecurityCheck();
module.exports = { assertNativeRuntimeSecure, createNativeRuntimeSecurityCheck };

// #endregion
