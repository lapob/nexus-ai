#!/usr/bin/env node
/**
 * @module scripts/measure-cosmic-performance
 * @description Misura il clock visivo del Core pubblico su desktop e mobile.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  browserExecutable,
  Cdp,
  evaluateWhenReady,
  freePort,
  waitForTarget
} = require('./web-visual-regression');

// #region 01 — Profili e raccolta metriche

const url = process.argv.find((value) => /^https?:\/\//i.test(value)) || 'https://ai.nexusnxs.com/';
const strict = process.argv.includes('--strict');
const profiles = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 }
];

function collectCosmicPerformance() {
  return new Promise((resolve) => {
    const core = document.getElementById('core');
    const api = globalThis.nexusCosmicMetrics;
    if (!core || typeof api?.renderer !== 'function') return resolve({ error: 'Metriche Core non disponibili' });
    core.dataset.state = 'thinking';
    const before = api.renderer();
    const samples = [];
    let previous = performance.now();
    const started = previous;
    const tick = (now) => {
      samples.push(now - previous);
      previous = now;
      if (now - started < 3_500) requestAnimationFrame(tick);
      else {
        const sorted = samples.slice(2).sort((a, b) => a - b);
        const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
        const renderer = api.renderer();
        const durationMs = now - started;
        const drawnFrames = renderer.draws - before.draws;
        resolve({
          durationMs,
          drawnFrames,
          coreFps: drawnFrames * 1000 / durationMs,
          sampleCount: sorted.length,
          fps: Number((1000 / (sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length))).toFixed(1)),
          p50FrameMs: Number(percentile(.5).toFixed(2)),
          p95FrameMs: Number(percentile(.95).toFixed(2)),
          longFramePercent: Number((sorted.filter((value) => value > 34).length / Math.max(1, sorted.length) * 100).toFixed(2)),
          continuum: { tier: api.tier, particleCount: renderer.particles, renderer }
        });
      }
    };
    requestAnimationFrame(tick);
  });
}
const METRICS_EXPRESSION = `(${collectCosmicPerformance.toString()})()`;

function validCosmicPerformance(entry) {
  const renderer = entry?.continuum?.renderer;
  const floor = entry?.continuum?.tier === 'efficient' ? 27 : 50;
  return Boolean(renderer && Number.isSafeInteger(renderer.draws) && renderer.draws > 0
    && Number.isFinite(renderer.drawMs) && Number.isFinite(renderer.particles) && renderer.particles > 0
    && Number.isFinite(entry.durationMs) && entry.durationMs >= 3000
    && Number.isSafeInteger(entry.drawnFrames) && entry.drawnFrames > 0
    && Number.isFinite(entry.coreFps) && entry.coreFps >= floor
    && Number.isFinite(entry.sampleCount) && entry.sampleCount >= 20
    && Number.isFinite(entry.p95FrameMs) && entry.p95FrameMs <= 25
    && Number.isFinite(entry.longFramePercent) && entry.longFramePercent <= 3);
}

// #endregion

// #region 02 — Esecuzione e report

async function measure(profile) {
  const port = await freePort();
  const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cosmic-qa-'));
  const child = spawn(browserExecutable(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${browserProfile}`,
    `--window-size=${profile.width},${profile.height}`, '--hide-scrollbars', '--disable-background-networking',
    '--disable-default-apps', '--no-first-run', '--remote-allow-origins=*', url
  ], { stdio: 'ignore', windowsHide: true });
  let client;
  try {
    const target = await waitForTarget(port, url, 45_000);
    client = await new Cdp(target.webSocketDebuggerUrl).open();
    await client.command('Emulation.setDeviceMetricsOverride', {
      width: profile.width,
      height: profile.height,
      deviceScaleFactor: 1,
      mobile: profile.width < 600,
      screenWidth: profile.width,
      screenHeight: profile.height
    });
    await client.command('Page.reload', { ignoreCache: true });
    await evaluateWhenReady(client, `new Promise((resolve, reject) => {
      const started = performance.now();
      const check = () => {
        if (globalThis.nexusCosmicMetrics?.renderer?.().arrival === 1) return resolve(true);
        if (performance.now() - started > 30000) return reject(new Error('Core non ancora assemblato'));
        setTimeout(check, 50);
      };
      check();
    })`, 45_000);
    return await evaluateWhenReady(client, METRICS_EXPRESSION, 45_000);
  } finally {
    client?.close();
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const resolved = path.resolve(browserProfile);
    if (resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(resolved, { recursive: true, force: true });
  }
}

async function main() {
  const report = [];
  for (const profile of profiles) report.push({ profile: profile.id, ...await measure(profile) });
  console.log(JSON.stringify({ url, measuredAt: new Date().toISOString(), profiles: report }, null, 2));
  if (strict) {
    const failed = report.some((entry) => !validCosmicPerformance(entry));
    if (failed) process.exitCode = 1;
  }
}
if (require.main === module) main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
module.exports = { collectCosmicPerformance, validCosmicPerformance };

// #endregion
