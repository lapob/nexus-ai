/**
 * @module scripts/run-electron-builder
 * @description Esegue electron-builder usando esclusivamente cache portabili accanto al progetto.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const portableCacheRoot = path.resolve(root, '..', '.toolchains', 'cache');
const electronCache = path.join(portableCacheRoot, 'electron');
const builderCache = path.join(portableCacheRoot, 'electron-builder');
const cli = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const releaseConfigPath = path.join(root, 'config', 'public-client.release.json');
const generatedConfigPath = path.join(root, 'build', '.electron-builder.generated.json');

for (const directory of [electronCache, builderCache]) fs.mkdirSync(directory, { recursive: true });
if (!fs.existsSync(cli)) throw new Error('electron-builder non disponibile. Esegui npm install e riprova.');

let builderArguments = process.argv.slice(2);
let generatedConfig = false;
try {
  const releaseConfig = JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8'));
  const leanPublicClient = releaseConfig.mode === 'public' && process.env.NEXUS_BUNDLE_OFFLINE_VOICE !== '1';
  if (leanPublicClient) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const build = { ...pkg.build, extraResources: [] };
    fs.mkdirSync(path.dirname(generatedConfigPath), { recursive: true });
    fs.writeFileSync(generatedConfigPath, `${JSON.stringify(build, null, 2)}\n`, 'utf8');
    builderArguments = ['--config', generatedConfigPath, ...builderArguments];
    generatedConfig = true;
    process.stdout.write('Pacchetto pubblico leggero: voce di sistema attiva, runtime neurali locali esclusi.\n');
  }
} catch (error) {
  if (fs.existsSync(releaseConfigPath)) throw error;
}

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

if (generatedConfig) fs.rmSync(generatedConfigPath, { force: true });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
