/**
 * @module tests/npm-scripts
 * @description Protegge i contratti dei comandi npm e del preflight di sviluppo.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const preflight = fs.readFileSync(path.join(root, 'scripts', 'prepare-development.js'), 'utf8');
const launcher = fs.readFileSync(path.join(root, 'scripts', 'start-electron.js'), 'utf8');
const taskManager = fs.readFileSync(path.join(root, 'scripts', 'manage-headless-server-task.ps1'), 'utf8');
const dashboardLauncher = fs.readFileSync(path.join(root, 'scripts', 'open-server-dashboard.ps1'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'scripts', 'server-dashboard.ps1'), 'utf8');
const funnelManager = fs.readFileSync(path.join(root, 'scripts', 'manage-tailscale-funnel.ps1'), 'utf8');
const headlessRunner = fs.readFileSync(path.join(root, 'scripts', 'run-headless-server.ps1'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'src', 'application', 'bootstrap.js'), 'utf8');
const nexusManager = fs.readFileSync(path.join(root, 'scripts', 'manage-nexus.ps1'), 'utf8');
const modelEvaluator = fs.readFileSync(path.join(root, 'scripts', 'evaluate-local-models.js'), 'utf8');
const ollamaPreflight = fs.readFileSync(path.join(root, 'scripts', 'ensure-ollama-runtime.js'), 'utf8');
const releaseReadiness = fs.readFileSync(path.join(root, 'scripts', 'check-release-readiness.js'), 'utf8');
const electronBuilderLauncher = fs.readFileSync(path.join(root, 'scripts', 'run-electron-builder.js'), 'utf8');

// #region 01 — Contratti dei comandi

test('start e dev preparano il progetto prima di aprire Electron', () => {
  assert.match(pkg.scripts.start, /prepare-development\.js --mode=start/);
  assert.match(pkg.scripts.start, /start-electron\.js/);
  assert.match(pkg.scripts.dev, /prepare-development\.js --mode=dev/);
  assert.match(pkg.scripts.dev, /start-electron\.js/);
  assert.equal(pkg.scripts.build, 'npm run build:renderer');
});

test('stop arresta l intero albero NexusNXS e il launcher inoltra i segnali', () => {
  assert.match(pkg.scripts.stop, /manage-nexus\.ps1 -Action stop/);
  assert.match(launcher, /terminateChildTree/);
  assert.match(launcher, /taskkill\.exe/);
  assert.match(launcher, /SIGINT/);
  assert.match(launcher, /SIGTERM/);
  assert.match(nexusManager, /taskkill\.exe[\s\S]*?\/T[\s\S]*?\/F/);
  assert.match(nexusManager, /prepare-development\.js/);
});

test('tutti i target diretti dei comandi npm esistono', () => {
  const missing = [];
  for (const [name, command] of Object.entries(pkg.scripts)) {
    for (const match of String(command).matchAll(/(?:scripts|tests|src)[\\/][^\s&"'*?]+\.(?:js|ps1)/g)) {
      if (!fs.existsSync(path.join(root, match[0]))) missing.push(`${name}: ${match[0]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('il setup pubblico usa il servizio remoto e non incorpora Ollama', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(packageJson.scripts['build:win'], /prepare:public/);
  assert.doesNotMatch(packageJson.scripts['build:win'], /prepare:ollama/);
  assert.equal(packageJson.build.extraResources.some((entry) => /ollama/i.test(String(entry.from))), false);
  assert.match(fs.readFileSync(path.join(root, 'scripts', 'prepare-public-release.js'), 'utf8'), /NEXUS_SERVICE_URL/);
  assert.match(packageJson.scripts['security:ollama'], /check-ollama-runtime-security/);
  assert.match(packageJson.scripts['security:ollama'], /--development-loopback/, 'il server locale accetta finding di moduli soltanto quando confinato a loopback');
  assert.doesNotMatch(packageJson.scripts['security:ollama:distribution'], /--development-loopback/, 'una distribuzione con runtime incorporato deve restare fail-closed');
  assert.match(releaseReadiness, /ollamaResources[\s\S]*check-ollama-runtime-security/);
});

test('il packaging usa cache portabili indipendenti dalla lettera del volume', () => {
  assert.match(pkg.scripts.pack, /run-electron-builder\.js --dir/);
  assert.match(pkg.scripts['build:win'], /run-electron-builder\.js --win nsis/);
  assert.match(electronBuilderLauncher, /\.\.['"], ['"]\.toolchains['"], ['"]cache/);
  assert.match(electronBuilderLauncher, /ELECTRON_CACHE:\s*electronCache/);
  assert.match(electronBuilderLauncher, /ELECTRON_BUILDER_CACHE:\s*builderCache/);
});

test('server avvia il runtime headless sullo storage portatile', () => {
  assert.match(pkg.scripts.server, /manage-headless-server-task\.ps1 -Action start/);
  assert.match(pkg.scripts['server:foreground'], /start-electron\.js --server/);
  assert.match(pkg.scripts['server:dashboard'], /open-server-dashboard\.ps1/);
  assert.match(pkg.scripts['control:status'], /server-dashboard\.ps1 -Once/);
  assert.match(pkg.scripts['server:install'], /manage-headless-server-task\.ps1 -Action install/);
  assert.match(launcher, /NEXUS_USER_DATA_ROOT/);
  assert.match(launcher, /portableTempRoot/);
  assert.match(launcher, /TEMP:\s*portableTempRoot/);
  assert.match(launcher, /TMP:\s*portableTempRoot/);
  assert.match(launcher, /loaderSafeRuntimeExecutable/);
  assert.match(launcher, /NexusNXS-Runtime/);
  assert.match(launcher, /NEXUS_OLLAMA_EXECUTABLE_PATH/);
  assert.match(launcher, /\.\.['"], ['"]\.nexus-data/);
  assert.match(launcher, /forwardedArguments/);
  assert.match(taskManager, /pwsh\.exe/);
  assert.match(taskManager, /WindowStyle Hidden/);
  assert.match(dashboardLauncher, /pwsh\.exe/);
  assert.match(dashboardLauncher, /WindowStyle Normal/);
  assert.doesNotMatch(dashboardLauncher, /WindowStyle Minimized/);
  assert.match(dashboard, /Get-ActiveConnections/);
  assert.match(dashboard, /Get-SloStatus/);
  assert.match(dashboard, /tailscale ping/);
  assert.match(dashboard, /\[int\]\$_ -gt 0/);
  assert.match(taskManager, /\[int\]\$_ -gt 0/);
  assert.match(taskManager, /Stop-HeadlessProcesses/);
  assert.match(taskManager, /Request-GracefulProcessShutdown/);
  assert.match(taskManager, /request-headless-shutdown\.js/);
  assert.match(taskManager, /Wait-ForGateway \$false 12/);
  assert.match(taskManager, /coldStartTimeoutSeconds\s*=\s*360/);
  assert.match(taskManager, /Wait-ForGateway \$true \$coldStartTimeoutSeconds/);
  assert.match(taskManager, /Install-ServerTask/);
  assert.match(taskManager, /32145, 32147/);
  assert.match(taskManager, /taskkill\.exe/);
  assert.match(bootstrap, /singleInstance:\s*!smokeTest\s*&&\s*!headlessMode/);
  assert.match(bootstrap, /deviceCoreMode\s*=\s*process\.argv\.includes\('--background'\)/);
  assert.match(bootstrap, /independentCoreRunning/);
  assert.match(bootstrap, /NEXUS_REMOTE_ALLOW_LAN\s*===\s*'1'/, 'il servizio headless deve confinare il gateway a loopback salvo opt-in LAN esplicito');
  assert.match(bootstrap, /remoteGateway\.state\.allowLan\s*=\s*allowLan/);
  assert.match(bootstrap, /const status = await remoteGateway\.start\(\)/, 'il server deve attendere il bind prima di dichiararsi avviato');
  assert.match(bootstrap, /coordinateShutdown/, 'lo shutdown deve chiudere gli store anche con servizi lenti');
});

test('lo sviluppo preferisce Ollama verificato sul disco portatile', () => {
  assert.match(ollamaPreflight, /\.\.\.\(fs\.existsSync\(portableExecutable\)[\s\S]*?\[portableExecutable\][\s\S]*?\), \.\.\.installed/);
});

test('l audit storage e disponibile senza operazioni distruttive', () => {
  assert.match(pkg.scripts['storage:audit'], /audit-portable-storage\.ps1/);
  const audit = fs.readFileSync(path.join(root, 'scripts', 'audit-portable-storage.ps1'), 'utf8');
  assert.doesNotMatch(audit, /Remove-Item|Clear-Content|Format-Volume|Move-Item/);
});

test('hardening host separa audit non distruttivo e applicazione amministrativa', () => {
  assert.match(pkg.scripts['host:audit'], /harden-windows-host\.ps1 -Action Audit/);
  assert.match(pkg.scripts['host:harden'], /harden-windows-host\.ps1 -Action Apply/);
});

test('i comandi NexusNXS unificano desktop, server, stato e riparazione conservativa', () => {
  for (const action of ['start', 'stop', 'restart', 'status', 'repair']) {
    assert.match(pkg.scripts[`nexus:${action}`], new RegExp(`manage-nexus\\.ps1 -Action ${action}`));
  }
  assert.match(nexusManager, /Test-HttpHealth/);
  assert.match(nexusManager, /Test-AiHealth/);
  assert.match(nexusManager, /NEXUS_USER_DATA_ROOT/);
  assert.match(nexusManager, /settings\.json/);
  assert.match(nexusManager, /IPAddress\]::IsLoopback/);
  assert.match(nexusManager, /127\.0\.0\.1:11435[\s\S]*127\.0\.0\.1:11434/);
  assert.match(nexusManager, /foreach \(\$endpoint in \$endpoints\)/);
  assert.match(nexusManager, /Ensure-ServerTask/);
  assert.match(nexusManager, /CommandLine -like '\*electron\.exe \*'/, 'il client Electron con --ui deve risultare aperto');
  assert.doesNotMatch(nexusManager, /CommandLine -like '\*electron\.exe \.\*'/, 'il rilevamento non deve richiedere un punto dopo electron.exe');
  assert.match(nexusManager, /CommandLine -notlike '\*--presence\*'/, 'la shell Presence non deve risultare come app desktop aperta');
  assert.match(nexusManager, /function Get-PresenceProcesses/);
  assert.match(nexusManager, /Presence = if \(@\(Get-PresenceProcesses\)\.Count\)/);
  assert.match(nexusManager, /statusCode\s+-eq\s+401[\s\S]*?\/healthz[\s\S]*?legacy-online/);
  assert.doesNotMatch(nexusManager, /funnel --|cloudflare|Remove-Item/i);
});

test('lo stato AI segue la porta privata posseduta dal Core corrente', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'manage-nexus.ps1'), 'utf8');
  assert.match(source, /12000 \+ \(\[int\]\$serverProcess\.ProcessId % 1000\)/);
  assert.match(source, /CommandLine -like '\* --server\*'/);
});

test('Funnel pubblica soltanto il listener guest separato', () => {
  assert.match(pkg.scripts.funnel, /manage-tailscale-funnel\.ps1 -Action enable/);
  assert.match(pkg.scripts['funnel:disable'], /-Action disable/);
  assert.match(funnelManager, /127\.0\.0\.1:32147/);
  assert.match(funnelManager, /--https=\$httpsPort/);
  assert.match(funnelManager, /NEXUS_FALLBACK_URL=/);
  assert.match(headlessRunner, /NEXUS_PUBLIC_PORT = '32147'/);
  assert.doesNotMatch(funnelManager, /0\.0\.0\.0/);
});

test('verify e release includono diagnostica sicurezza e verifica installer', () => {
  assert.match(pkg.scripts.verify, /npm run check/);
  assert.match(pkg.scripts.verify, /npm test/);
  assert.match(pkg.scripts.verify, /npm run verify:experience/);
  assert.match(pkg.scripts['verify:experience'], /npm run ai:evaluate:gate/);
  assert.match(pkg.scripts['verify:experience'], /npm run voice:evaluate/);
  assert.match(pkg.scripts['verify:experience'], /npm run smoke/);
  assert.match(pkg.scripts['verify:experience'], /npm run verify:shutdown/);
  assert.equal(pkg.scripts['verify:shutdown'], 'node scripts/verify-app-shutdown.js');
  assert.match(pkg.scripts['verify:experience'], /npm run soak/);
  assert.match(pkg.scripts['load:gateway'], /load-test-gateway/);
  assert.match(pkg.scripts['security:gate'], /check:publication/);
  assert.match(pkg.scripts['security:gate'], /audit:runtime/);
  assert.match(pkg.scripts['security:gate'], /sbom/);
  assert.match(pkg.scripts.verify, /npm run doctor/);
  assert.match(pkg.scripts.verify, /npm run audit:runtime/);
  assert.match(pkg.scripts['verify:full'], /npm run ai:evaluate:extended/);
  assert.match(pkg.scripts['verify:full'], /npm run qa:visual/);
  assert.match(pkg.scripts['verify:full'], /npm run audit:tooling/);
  assert.match(pkg.scripts['verify:full'], /npm run sbom/);
  assert.match(pkg.scripts.release, /npm run verify/);
  assert.match(pkg.scripts['release:manifest:refresh'], /refresh-preview-release-manifest\.js/);
  assert.match(pkg.scripts.release, /npm run build:win/);
  assert.match(pkg.scripts.release, /npm run verify:installer/);
});

test('il gate di produzione richiede firma e origini per entrambi i client pubblici', () => {
  assert.match(releaseReadiness, /secureOrigin\('NEXUS_SERVICE_URL', production\)/);
  assert.match(releaseReadiness, /secureOrigin\('NEXUS_URL', true\)/);
  assert.match(releaseReadiness, /NEXUS_UPDATE_URL deve essere una directory HTTPS pulita/);
  for (const variable of [
    'CSC_LINK', 'CSC_KEY_PASSWORD', 'NEXUS_ANDROID_KEYSTORE',
    'NEXUS_ANDROID_STORE_PASSWORD', 'NEXUS_ANDROID_KEY_ALIAS', 'NEXUS_ANDROID_KEY_PASSWORD',
  ]) assert.match(releaseReadiness, new RegExp(variable));
});

test('la valutazione AI segue la porta privata posseduta dal runtime NexusNXS', () => {
  assert.match(modelEvaluator, /persistedPrivateEndpoint/);
  assert.match(modelEvaluator, /\.nexus-data/);
  assert.match(modelEvaluator, /settings\?\.ai\?\.ollama\?\.baseUrl/);
  assert.match(modelEvaluator, /\['127\.0\.0\.1', 'localhost', '::1'\]/);
});

test('il gate AI concede al modello profondo un cold start misurabile senza alterare gli SLO di risposta', () => {
  assert.match(modelEvaluator, /REQUEST_TIMEOUT_MS[\s\S]*150_000/);
  assert.match(fs.readFileSync(path.join(root, 'config', 'product-slo.json'), 'utf8'), /"maximumBestP95LatencyMs"\s*:\s*4000/);
});

test('il preflight è incrementale e non apre shell Windows secondarie', () => {
  assert.match(preflight, /rendererNeedsBuild/);
  assert.match(preflight, /knowledge:normalize/);
  assert.match(preflight, /ensureManagedRuntime/);
  assert.match(preflight, /spawnSync\(process\.execPath/);
  assert.doesNotMatch(preflight, /spawnSync\(['"](?:cmd|npm\.cmd)/i);
  assert.match(preflight, /windowsHide:\s*true/);
  assert.match(launcher, /reusableCoreRuntime/);
  assert.match(launcher, /readLock\(path\.join\(portableDataRoot, 'headless-server\.lock'\)\)/);
  assert.match(launcher, /NEXUS_MANAGED_OLLAMA:\s*presenceMode\s*\|\|\s*reusableCoreRuntime\s*\?\s*'0'\s*:\s*'1'/);
  assert.match(launcher, /NEXUS_OLLAMA_BASE_URL:\s*coreRuntimeBaseUrl/);
  assert.match(launcher, /windowsHide:\s*true/);
});

test('l installer include soltanto il runtime Kokoro effettivamente usato', () => {
  const resources = pkg.build.extraResources;
  assert.ok(resources.some((entry) => entry.from === 'vendor/kokoro/worker.py'));
  assert.ok(resources.some((entry) => entry.from === 'vendor/kokoro/models'));
  const packages = resources.find((entry) => entry.from === 'vendor/kokoro/.venv/Lib/site-packages');
  assert.ok(packages);
  assert.ok(packages.filter.some((pattern) => pattern.includes('__pycache__')));
  assert.equal(resources.some((entry) => entry.from === 'vendor/kokoro'), false);
});

test('il builder pubblico esclude i runtime vocali locali e conserva il pacchetto completo per sviluppo', () => {
  const builder = fs.readFileSync(path.join(root, 'scripts', 'run-electron-builder.js'), 'utf8');
  assert.match(builder, /releaseConfig\.mode === 'public'/);
  assert.match(builder, /NEXUS_BUNDLE_OFFLINE_VOICE/);
  assert.match(builder, /extraResources:\s*\[\]/);
  assert.match(builder, /\.electron-builder\.generated\.json/);
});

// #endregion
