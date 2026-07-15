const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electronBinary = require('electron');
const child = spawn(electronBinary, ['.'], {
  cwd: root,
  env: { ...process.env, NEXUS_SMOKE_TEST: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });

const timeout = setTimeout(() => {
  child.kill();
  console.error('Smoke test Electron scaduto.');
  process.exitCode = 1;
}, 15000);

child.on('error', (error) => {
  clearTimeout(timeout);
  console.error(`Impossibile avviare Electron: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    console.error(stderr.trim() || `Electron terminato con codice ${code}.`);
    process.exitCode = 1;
  } else {
    console.log('Electron, preload, CSP, renderer e IPC caricati correttamente.');
  }
});
