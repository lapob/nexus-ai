const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('gli entry point developer non dipendono dalla lettera o dal profilo della workstation', () => {
  const operationalFiles = [
    'scripts/lib/development-paths.ps1',
    'scripts/build-android-remote.ps1',
    'scripts/build-android-console.ps1',
    'scripts/benchmark-android-ui.ps1',
    'scripts/start-portable-ollama.ps1',
    'scripts/ensure-ollama-runtime.js',
    'scripts/prepare-training-dataset.js',
    'scripts/audit-portable-storage.ps1'
  ];
  for (const relative of operationalFiles) {
    const source = read(relative);
    assert.doesNotMatch(source, /Z:[\\/]/i, `${relative} contiene una dipendenza da Z:`);
    assert.doesNotMatch(source, /C:[\\/]Users[\\/]steal/i, `${relative} contiene un profilo personale`);
  }
});

test('le build Android rigenerano la configurazione locale dalla toolchain risolta', () => {
  const helper = read('scripts/lib/development-paths.ps1');
  for (const relative of ['scripts/build-android-remote.ps1', 'scripts/build-android-console.ps1']) {
    const source = read(relative);
    assert.match(source, /development-paths\.ps1/);
    assert.match(source, /Initialize-NexusAndroidBuildEnvironment/);
    assert.match(source, /Resolve-NexusGradleExecutable[^\n]+9\.7\.1/);
    assert.match(source, /\[IO\.Directory\]::EnumerateFiles\(/);
    assert.doesNotMatch(source, /Get-ChildItem[^\n]+build-tools[^\n]+-Recurse/);
    assert.doesNotMatch(source, /Join-Path \$env:(?:LOCALAPPDATA|USERPROFILE)/);
  }
  assert.match(helper, /Set-NexusAndroidLocalProperties/);
  assert.match(helper, /NEXUS_ANDROID_SDK/);
  assert.match(helper, /NEXUS_GRADLE_USER_HOME/);
  assert.match(helper, /\$env:GRADLE_USER_HOME = \[IO\.Path\]::GetFullPath\(\$gradleUserHome\)/);
  assert.match(helper, /Join-Path \$Layout\.ToolchainsRoot 'gradle'/);
  assert.match(helper, /Android Studio\\jbr/);
});

test('dataset e modelli developer restano relativi al workspace o al volume corrente', () => {
  assert.match(read('scripts/prepare-training-dataset.js'), /path\.join\(root, '\.\.', '\.nexus-data'\)/);
  assert.doesNotMatch(read('scripts/prepare-training-dataset.js'), /process\.env\.APPDATA/);
  assert.match(read('scripts/ensure-ollama-runtime.js'), /preferredDriveRoots:\s*\[path\.resolve\(projectRoot, '\.\.'\)\]/);
  const bootstrap = read('src/application/bootstrap.js');
  assert.match(bootstrap, /resolveOllamaLibrary\(requiredModels/);
  assert.match(bootstrap, /preferredDriveRoots:\s*\[path\.resolve\(appRoot, '\.\.'\)\]/);
  assert.match(bootstrap, /existingLibrary\.existing/);
  for (const relative of ['scripts/evaluate-local-models.js', 'scripts/run-ai-eval-lab.js']) {
    const source = read(relative);
    assert.match(source, /path\.resolve\(__dirname, '\.\.', '\.\.', '\.nexus-data'\)/);
    assert.doesNotMatch(source, /path\.resolve\(process\.cwd\(\), '\.\.', '\.nexus-data'\)/);
  }
  const launcher = read('scripts/start-electron.js');
  assert.match(launcher, /aliasEntry\.isSymbolicLink\(\)/);
  assert.match(launcher, /fs\.unlinkSync\(aliasDirectory\)/);
  assert.match(launcher, /explicit\s*&&\s*fs\.existsSync\(explicit\)/);
});

test('i task di avvio risolvono il volume per identità e percorso relativo', () => {
  const taskManager = read('scripts/manage-headless-server-task.ps1');
  assert.match(taskManager, /Get-PortableTaskArguments/);
  assert.match(taskManager, /\.UniqueId -eq/);
  assert.match(taskManager, /Join-Path \(\(\[string\]\`\$volume\.DriveLetter\)/);
  assert.match(taskManager, /-EncodedCommand/);
  assert.doesNotMatch(taskManager, /-File \"\{0\}\"/);
});
