/**
 * @module scripts/run-electron-builder
 * @description Esegue electron-builder usando esclusivamente cache portabili accanto al progetto.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyElectronRuntime, verifyElectronBuildTarget } = require('./lib/installer-artifacts');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const requestedArguments = process.argv.slice(2);
verifyElectronBuildTarget(requestedArguments, pkg.build);
const electronVersion = verifyElectronRuntime(root);
const portableCacheRoot = path.resolve(root, '..', '.toolchains', 'cache');
const electronCache = path.join(portableCacheRoot, 'electron');
const builderCache = path.join(portableCacheRoot, 'electron-builder');
const cli = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const releaseConfigPath = path.join(root, 'config', 'public-client.release.json');
const generatedConfigPath = path.join(root, 'build', '.electron-builder.generated.json');

for (const directory of [electronCache, builderCache]) fs.mkdirSync(directory, { recursive: true });
if (!fs.existsSync(cli)) throw new Error('electron-builder non disponibile. Esegui npm install e riprova.');

let leanPublicClient = false;
try {
  const releaseConfig = JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8'));
  leanPublicClient = releaseConfig.mode === 'public' && process.env.NEXUS_BUNDLE_OFFLINE_VOICE !== '1';
} catch (error) {
  if (fs.existsSync(releaseConfigPath)) throw error;
}
const build = { ...pkg.build, electronVersion, ...(leanPublicClient ? { extraResources: [] } : {}) };
fs.mkdirSync(path.dirname(generatedConfigPath), { recursive: true });
fs.writeFileSync(generatedConfigPath, `${JSON.stringify(build, null, 2)}\n`, 'utf8');
const builderArguments = ['--config', generatedConfigPath, ...requestedArguments];
if (leanPublicClient) process.stdout.write('Pacchetto pubblico leggero: voce di sistema attiva, runtime neurali locali esclusi.\n');

const result = spawnSync(process.execPath, [cli, ...builderArguments], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    ELECTRON_CACHE: electronCache,
    ELECTRON_BUILDER_CACHE: builderCache
  }
});

fs.rmSync(generatedConfigPath, { force: true });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
