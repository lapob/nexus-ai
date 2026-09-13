/** @module scripts/profile-local-stt Synthetic latency diagnostic; not a human speech acceptance evaluation. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { NeuralSpeechService } = require('../src/voice/neural-speech');
const { wordErrorRate } = require('./evaluate-local-stt');
const runtime = require('../config/python-runtime.json');

async function main() {
  const root = path.resolve(__dirname, '..');
  const whisper = path.join(root, 'vendor/whisper/windows-x64');
  const model = path.join(whisper, 'ggml-base.bin');
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(root, '../.toolchains/playwright');
  const executable = path.join(whisper, 'whisper-cli.exe');
  if (!fs.existsSync(model) || !fs.existsSync(executable)) throw new Error('Local Whisper base runtime missing.');
  const { chromium } = require(path.join(root, '../.SITE/node_modules/@playwright/test'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stt-profile-'));
  const service = new NeuralSpeechService({ runtimeDirectory: path.join(root, 'vendor/kokoro'), pythonRuntimeDirectory: path.join(root, ...runtime.runtimeDirectory.split('/')) });
  let browser;
  try {
    const text = 'Ciao Nexus, mi chiamo Marco. Vorrei organizzare il lavoro di domani.';
    const synthesis = await service.synthesize({ text, gender: 'male', language: 'it', delivery: 'warm' });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const samples = await page.evaluate(async (bytes) => {
      const context = new OfflineAudioContext(1, 1, 16000);
      const decoded = await context.decodeAudioData(new Uint8Array(bytes).buffer);
      const render = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
      const source = render.createBufferSource(); source.buffer = decoded; source.connect(render.destination); source.start();
      return Array.from((await render.startRendering()).getChannelData(0));
    }, Array.from(synthesis.audio));
    await browser.close(); browser = null;
    service.shutdown();
    const audio = Buffer.alloc(44 + samples.length * 2);
    audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
    audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
    audio.write('data', 36); audio.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((value, index) => audio.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2));
    const input = path.join(directory, 'synthetic.wav'); fs.writeFileSync(input, audio);
    const results = [];
    for (const language of ['auto', 'it']) for (const threads of [8, 4, 2]) {
      const output = path.join(directory, `transcript-${language}-${threads}`);
      const started = performance.now();
      const diagnostic = await new Promise((resolve, reject) => {
        const child = spawn(executable, ['-m', model, '-f', input, '-l', language, '-t', String(threads), '-nth', '0.68', '-sns', '-sow', '-nt', '-otxt', '-of', output], { cwd: whisper, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        const timer = setTimeout(() => { child.kill(); reject(new Error('STT diagnostic timed out.')); }, 90000);
        child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-32768); });
        child.on('error', (error) => { clearTimeout(timer); reject(error); });
        child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(stderr); else reject(new Error(`Whisper exit ${code}: ${stderr.slice(-2000)}`)); });
      });
      const transcript = fs.readFileSync(`${output}.txt`, 'utf8').trim();
      const result = { language, threads, latencyMs: Math.round(performance.now() - started), wer: wordErrorRate(text, transcript), timings: diagnostic.split(/\r?\n/).filter((line) => /whisper_print_timings:/.test(line)) };
      results.push(result); process.stdout.write(`${JSON.stringify(result)}\n`);
    }
    const report = { evaluatedAt: new Date().toISOString(), syntheticOnly: true, productionSettingsChanged: false, model: 'base', durationSeconds: samples.length / 16000, results };
    fs.mkdirSync(path.join(root, 'qa-artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'qa-artifacts/local-stt-profile.json'), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    service.shutdown();
    if (browser) await browser.close();
    // Only the unique temporary directory created by this invocation is removed.
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
