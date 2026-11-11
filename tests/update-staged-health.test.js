/**
 * @module tests/update-staged-health
 * @description Rollout a fasi firmate, controllo manuale che salta la coorte, segnale di salute anonimo.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluateUpdateRollout, stagedPercentage } = require('../src/infrastructure/electron/update-rollout');
const { createUpdateHealth, isCrashExit } = require('../src/infrastructure/electron/update-health');
const { releaseManifest } = require('../scripts/release-manifest');
const { validateReleaseManifest } = require('../src/security/release-integrity');

const HOUR = 3_600_000;
const published = Date.parse('2026-11-11T10:00:00.000Z');
const preview = (stages) => ({ channel: 'preview', generatedAt: new Date(published).toISOString(), updatePolicy: { rollout: 'preview-auto', initialPercentage: 100, stages } });
const STAGES = [{ afterHours: 0, percentage: 25 }, { afterHours: 2, percentage: 60 }, { afterHours: 6, percentage: 100 }];

test('le fasi avanzano col tempo firmato e un orologio indietro non anticipa nulla', () => {
  const policy = { initialPercentage: 100, stages: STAGES };
  assert.equal(stagedPercentage(policy, new Date(published).toISOString(), published - 10 * HOUR), 25);
  assert.equal(stagedPercentage(policy, new Date(published).toISOString(), published + HOUR), 25);
  assert.equal(stagedPercentage(policy, new Date(published).toISOString(), published + 3 * HOUR), 60);
  assert.equal(stagedPercentage(policy, new Date(published).toISOString(), published + 7 * HOUR), 100);
  assert.equal(stagedPercentage({ initialPercentage: 40 }, 'invalid', published), 40);
});

test('coorte esclusa all inizio, inclusa a fase completa; il controllo manuale salta la coorte ma non la pausa', () => {
  // Cerca un seme oltre la prima fase (bucket > 25) in modo deterministico.
  let seed = 0;
  while (evaluateUpdateRollout(preview(STAGES), { rolloutSeed: `s${seed}`, now: published }).eligible) seed += 1;
  const rolloutSeed = `s${seed}`;
  assert.equal(evaluateUpdateRollout(preview(STAGES), { rolloutSeed, now: published }).reason, 'cohort-deferred');
  assert.equal(evaluateUpdateRollout(preview(STAGES), { rolloutSeed, now: published + 7 * HOUR }).eligible, true);
  assert.equal(evaluateUpdateRollout(preview(STAGES), { rolloutSeed, now: published, seeker: true }).reason, 'seeker');
  const paused = preview(STAGES); paused.updatePolicy.paused = true;
  assert.equal(evaluateUpdateRollout(paused, { rolloutSeed, now: published, seeker: true }).reason, 'paused');
  // Distinte 0.3.37 senza fasi: invariato, tutti subito.
  assert.equal(evaluateUpdateRollout(preview(undefined), { now: published }).reason, 'all');
});

test('la distinta firmata porta fasi valide e fasi malformate vengono rifiutate', () => {
  const artifacts = [{ path: 'release/x.exe', kind: 'installer', bytes: 1, sha256: 'a'.repeat(64), visibility: 'public' }];
  const signed = releaseManifest({ product: 'NexusNXS', version: '1.0.0', channel: 'preview', visibility: 'public', releaseClass: 'preview', artifacts, signatureRequired: true });
  assert.deepEqual(signed.updatePolicy.stages, STAGES);
  const stable = releaseManifest({ product: 'NexusNXS', version: '1.0.0', channel: 'stable', visibility: 'public', releaseClass: 'production', artifacts, signatureRequired: true });
  assert.equal(stable.updatePolicy.stages.at(-1).percentage, 100);
  for (const stages of [[], [{ afterHours: 1, percentage: 100 }], [{ afterHours: 0, percentage: 50 }], [{ afterHours: 0, percentage: 50 }, { afterHours: 0, percentage: 100 }], [{ afterHours: 0, percentage: 60 }, { afterHours: 2, percentage: 40 }, { afterHours: 3, percentage: 100 }]]) {
    assert.throws(() => validateReleaseManifest({ ...signed, updatePolicy: { ...signed.updatePolicy, stages } }), /rollout/i, JSON.stringify(stages));
  }
});

test('salute: un solo "healthy" dopo l attesa, crash su chiusura non pulita, niente identificativi', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nxs-health-'));
  const statePath = path.join(dir, 'health.json');
  const sent = [];
  const send = async (url, body) => { sent.push({ url, body: JSON.parse(body) }); };
  try {
    const first = createUpdateHealth({ statePath, version: '0.3.38', channel: 'preview', endpoint: 'https://nexusnxs.com/updates/preview/health', send, healthyAfterMs: 5 });
    first.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    first.stop();
    assert.deepEqual(sent.map((item) => item.body), [{ version: '0.3.38', channel: 'preview', event: 'healthy' }]);
    assert.deepEqual(Object.keys(sent[0].body).sort(), ['channel', 'event', 'version']);

    // Avvio pulito successivo: nessun nuovo segnale.
    const second = createUpdateHealth({ statePath, version: '0.3.38', channel: 'preview', endpoint: 'https://x/health', send, healthyAfterMs: 5 });
    second.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(sent.length, 1);
    // Il processo "muore" senza stop(): al riavvio conta come crash, una sola volta.
    const third = createUpdateHealth({ statePath, version: '0.3.38', channel: 'preview', endpoint: 'https://x/health', send, healthyAfterMs: 5 });
    third.start();
    third.crash();
    third.stop();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(sent.map((item) => item.body.event), ['healthy', 'crash']);
    if (process.platform !== 'win32') assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);

    // Nuova versione: contatori azzerati; disattivato = silenzio.
    const off = createUpdateHealth({ statePath, version: '0.3.39', channel: 'preview', endpoint: 'https://x/health', send, enabled: false, healthyAfterMs: 1 });
    off.start(); off.crash();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(sent.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(isCrashExit({ reason: 'crashed' }), true);
  assert.equal(isCrashExit({ reason: 'clean-exit' }), false);
  assert.equal(isCrashExit({ reason: 'killed' }), false);
});
