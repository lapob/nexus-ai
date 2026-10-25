const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditOllamaRuntime, blockingFindings, compareVersions, isLoopbackHost, parseOllamaVersion } = require('../src/ai/ollama-runtime-security');

function fixtureRunner({ findings = [], signature = { Status: 'Valid', Signer: 'CN=Ollama Inc., O=Ollama Inc.' } } = {}) {
  return (command, args) => {
    if (command === 'powershell.exe') return { status: 0, stdout: JSON.stringify(signature), stderr: '' };
    if (command === 'grype') return { status: 0, stdout: JSON.stringify({ matches: findings }), stderr: '' };
    if (args?.[0] === '--version') return { status: 0, stdout: 'ollama version is 0.32.15', stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected command' };
  };
}

test('il provisioning fissa origine, dimensioni e hash e non usa il profilo sviluppo', () => {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/ollama-runtime.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1); assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  for (const [kind, archive] of Object.entries(manifest.archives)) {
    const asset = kind === 'base' ? 'ollama-windows-amd64.zip' : 'ollama-windows-amd64-rocm.zip';
    assert.equal(archive.url, `https://github.com/ollama/ollama/releases/download/v${manifest.version}/${asset}`);
    assert.ok(Number.isSafeInteger(archive.bytes) && archive.bytes > 0); assert.match(archive.sha256, /^[a-f0-9]{64}$/);
  }
  const script = fs.readFileSync(path.join(root, 'scripts/prepare-ollama-runtime.ps1'), 'utf8');
  assert.doesNotMatch(script, /--development-loopback/);
  assert.ok(script.indexOf('$verifiedRocm = Resolve-VerifiedRuntimeArchive') < script.indexOf('Expand-ArchiveLiteral -LiteralArchive $verifiedBase'));
});

test('gli archivi cached alterati o troncati sono rifiutati prima di qualsiasi estrazione', { skip: process.platform !== 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-runtime-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = `
    $ErrorActionPreference = 'Stop'
    $source = [IO.File]::ReadAllText('scripts/prepare-ollama-runtime.ps1')
    $ast = [Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$null)
    $definition = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Resolve-VerifiedRuntimeArchive' }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
    $file = Join-Path $env:NEXUS_ARCHIVE_TEST_ROOT 'fixture.zip'
    [IO.File]::WriteAllText($file, 'fixture')
    $expected = '${require('node:crypto').createHash('sha256').update('fixture').digest('hex')}'
    $size = (Get-Item -LiteralPath $file).Length
    function Save-RemoteFile { throw 'Unrequested download' }
    $actual = Resolve-VerifiedRuntimeArchive $file '' '' $expected $size
    if ($actual -ne $file) { throw 'Unexpected archive path' }
    foreach ($kind in @('truncated', 'altered', 'missing')) {
      $inputFile = $file
      if ($kind -eq 'truncated') { [IO.File]::WriteAllText($file, 'x') }
      if ($kind -eq 'altered') { [IO.File]::WriteAllText($file, 'changed') }
      if ($kind -eq 'missing') { $inputFile = Join-Path $env:NEXUS_ARCHIVE_TEST_ROOT 'missing.zip' }
      $rejected = $false
      try { Resolve-VerifiedRuntimeArchive $inputFile '' '' $expected $size | Out-Null } catch { $rejected = $true }
      if (-not $rejected) { throw ('Archive accepted: ' + $kind) }
    }
    function Save-RemoteFile([string]$Uri, [string]$LiteralDestination) {
      if ($Uri -ne 'https://fixture.invalid/archive') { throw 'Unexpected URL' }
      [IO.File]::WriteAllText($LiteralDestination, 'fixture')
    }
    $actual = Resolve-VerifiedRuntimeArchive '' 'https://fixture.invalid/archive' $file $expected $size
    if ($actual -ne $file) { throw 'Downloaded fixture not verified' }
    Write-Output 'PASS cached and downloaded archive integrity'
  `;
  const result = require('node:child_process').spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, NEXUS_ARCHIVE_TEST_ROOT: root }, encoding: 'utf8', windowsHide: true, timeout: 30000
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /PASS cached and downloaded archive integrity/);
});

test('estrae la versione client anche quando Ollama non raggiunge il server', () => {
  assert.equal(parseOllamaVersion('Warning: client version is 0.32.3'), '0.32.3');
  assert.equal(parseOllamaVersion('ollama version is 0.32.15'), '0.32.15');
  assert.equal(compareVersions('0.32.15', '0.32.3'), 1);
  assert.equal(compareVersions('0.32.3', '0.32.3'), 0);
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
});

test('il gate accetta soltanto firma ufficiale e scansione senza High o Critical', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, 'verified-runtime');
  const result = auditOllamaRuntime(executable, { platform: 'win32', runProcess: fixtureRunner() });
  assert.equal(result.version, '0.32.15');
  assert.equal(result.signature.status, 'Valid');
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test('il gate passa allo scanner il file reale anche attraverso una junction', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-runtime-alias-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const actual = path.join(root, 'actual');
  fs.mkdirSync(actual);
  fs.writeFileSync(path.join(actual, 'ollama.exe'), 'synthetic-runtime');
  fs.symlinkSync(actual, path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const expected = fs.realpathSync.native(path.join(actual, 'ollama.exe'));
  const runner = fixtureRunner();
  let scanned = false;
  const result = auditOllamaRuntime(path.join(root, 'alias', 'ollama.exe'), {
    platform: 'linux', requireSignature: false,
    runProcess(command, args) {
      if (command === 'grype') { assert.equal(args[0], `file:${expected}`); scanned = true; }
      else assert.equal(command, expected);
      return runner(command, args);
    }
  });
  assert.equal(scanned, true);
  assert.equal(result.executable, expected);
});

test('uno scanner portabile esplicito conserva il gate fail-closed', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-scanner-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe'), scanner = path.join(root, 'portable tools', 'grype.exe');
  fs.writeFileSync(executable, 'synthetic-runtime');
  for (const outcome of ['clean', 'vulnerable', 'missing']) {
    let scanned = false;
    const baseline = fixtureRunner({ findings: outcome === 'vulnerable'
      ? [{ vulnerability: { id: 'HIGH-PORTABLE', severity: 'High' }, artifact: { name: 'stdlib' } }] : [] });
    const options = {
      platform: 'linux', requireSignature: false, scannerExecutable: scanner,
      runProcess(command, args, settings) {
        if (command !== executable) {
          assert.equal(command, scanner); assert.equal(args[0], `file:${executable}`);
          assert.equal(settings.env.GRYPE_CHECK_FOR_APP_UPDATE, 'false'); scanned = true;
          if (outcome === 'missing') return { status: null, error: new Error('scanner missing') };
          return baseline('grype', args);
        }
        return baseline(command, args);
      }
    };
    if (outcome === 'clean') assert.equal(auditOllamaRuntime(executable, options).blockingFindings, 0);
    else assert.throws(() => auditOllamaRuntime(executable, options), error => error.code === (outcome === 'missing' ? 'OLLAMA_SECURITY_SCAN_FAILED' : 'OLLAMA_RUNTIME_VULNERABLE'));
    assert.equal(scanned, true);
  }
});

test('il gate blocca vulnerabilità High o Critical e ignora severità inferiori', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, 'vulnerable-runtime');
  const findings = [
    { vulnerability: { id: 'LOW-1', severity: 'Low' }, artifact: { name: 'safe-enough' } },
    { vulnerability: { id: 'HIGH-1', severity: 'High' }, artifact: { name: 'stdlib' } },
    { vulnerability: { id: 'CRIT-1', severity: 'Critical' }, artifact: { name: 'x/crypto' } }
  ];
  assert.deepEqual(blockingFindings({ matches: findings }).map((item) => item.id), ['HIGH-1', 'CRIT-1']);
  assert.throws(
    () => auditOllamaRuntime(executable, { platform: 'win32', runProcess: fixtureRunner({ findings }) }),
    (error) => error.code === 'OLLAMA_RUNTIME_VULNERABLE' && error.details.findings.length === 2
  );
  const loopback = auditOllamaRuntime(executable, {
    platform: 'win32', runProcess: fixtureRunner({ findings }), usage: 'development', host: '127.0.0.1'
  });
  assert.equal(loopback.blockingFindings, 2);
  assert.equal(loopback.warnings[0].code, 'OLLAMA_MODULE_FINDINGS_LOOPBACK_ONLY');
  assert.throws(
    () => auditOllamaRuntime(executable, {
      platform: 'win32', runProcess: fixtureRunner({ findings }), usage: 'development', host: '0.0.0.0'
    }),
    (error) => error.code === 'OLLAMA_RUNTIME_VULNERABLE'
  );
});

test('il gate applica un floor di versione anche allo sviluppo loopback', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, 'old-runtime');
  const runner = (command, args) => {
    if (command === 'powershell.exe') return { status: 0, stdout: JSON.stringify({ Status: 'Valid', Signer: 'CN=Ollama Inc.' }), stderr: '' };
    if (command === 'grype') return { status: 0, stdout: JSON.stringify({ matches: [] }), stderr: '' };
    if (args?.[0] === '--version') return { status: 0, stdout: 'ollama version is 0.31.9', stderr: '' };
    return { status: 1, stderr: 'unexpected' };
  };
  assert.throws(
    () => auditOllamaRuntime(executable, { platform: 'win32', runProcess: runner, usage: 'development', host: '127.0.0.1' }),
    (error) => error.code === 'OLLAMA_VERSION_UNSUPPORTED'
  );
});

test('il gate fallisce chiuso se firma o scanner non sono verificabili', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, 'unknown-runtime');
  assert.throws(
    () => auditOllamaRuntime(executable, { platform: 'win32', runProcess: fixtureRunner({ signature: { Status: 'NotSigned', Signer: '' } }) }),
    (error) => error.code === 'OLLAMA_SIGNATURE_INVALID'
  );
  assert.throws(
    () => auditOllamaRuntime(executable, { platform: 'linux', requireSignature: false, runProcess: (command, args) => (
      args?.[0] === '--version' ? { status: 0, stdout: 'ollama version is 0.32.15', stderr: '' } : { status: 1, stderr: 'missing scanner' }
    ) }),
    (error) => error.code === 'OLLAMA_SECURITY_SCAN_FAILED'
  );
});

test('un report scanner vuoto, troncato o privo di severita non viene scambiato per pulito', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-scanner-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe'); fs.writeFileSync(executable, 'fixture');
  const baseline = fixtureRunner();
  const malformed = ['', '{', '{}', 'null', '{"matches":{}}', ...[
    { matches: [null] }, { matches: [{}] },
    { matches: [{ vulnerability: { id: 'X', severity: '' }, artifact: { name: 'stdlib' } }] },
    { matches: [{ vulnerability: { id: 'X', severity: 'unrecognized' }, artifact: { name: 'stdlib' } }] },
    { matches: [{ vulnerability: { id: 'X', severity: 'High' } }] }
  ].map(JSON.stringify)];
  for (const stdout of malformed) assert.throws(() => auditOllamaRuntime(executable, {
    platform: 'win32', runProcess(command, args, options) {
      return command === 'grype' ? { status: 0, stdout } : baseline(command, args, options);
    }
  }), { code: 'OLLAMA_SECURITY_SCAN_FAILED' });
  assert.equal(auditOllamaRuntime(executable, { platform: 'win32', runProcess: fixtureRunner({ findings: [
    { vulnerability: { id: 'UNCLASSIFIED', severity: 'Unknown' }, artifact: { name: 'stdlib' } }
  ] }) }).blockingFindings, 0);
});

test('il provisioning preserva backend GPU firmati, aggiornamento esplicito e rollback atomico', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'prepare-ollama-runtime.ps1'), 'utf8');
  assert.match(source, /\[switch\]\$ForceUpdate/);
  assert.match(source, /\[switch\]\$KeepBackup/);
  assert.match(source, /\[string\]\$SourceDirectory/);
  assert.match(source, /Assert-OfficialRuntimeTree -Root \$sourceFull/);
  assert.match(source, /Copy-Item -LiteralPath \(Join-Path \$sourceFull 'lib'\)/);
  assert.match(source, /Get-ChildItem -LiteralPath \$extract -Force[\s\S]+Copy-Item -Destination \$staging/);
  assert.match(source, /lib\\ollama\\rocm_v7_1\\ggml-hip\.dll/);
  assert.match(source, /lib\\ollama\\cuda_v12\\ggml-cuda\.dll/);
  assert.match(source, /lib\\ollama\\vulkan\\ggml-vulkan\.dll/);
  assert.match(source, /Get-ChildItem -LiteralPath \$Root -Recurse -File/);
  assert.match(source, /SignerCertificate\.Subject -match '\\bOllama Inc\\b'/);
  assert.match(source, /\.ollama-download-/);
  assert.match(source, /Move-Item -LiteralPath \$destinationFull -Destination \$backup/);
  assert.match(source, /Move-Item -LiteralPath \$staging -Destination \$destinationFull[\s\S]+Assert-OfficialRuntimeTree -Root \$destinationFull/);
  assert.match(source, /Move-Item -LiteralPath \$backup -Destination \$destinationFull/);
  assert.match(source, /if \(\$KeepBackup\)/);
});

test('il provisioning accetta solo redistributable Microsoft validi e rifiuta publisher o firme errati', { skip: process.platform !== 'win32' }, () => {
  const script = `
    $ErrorActionPreference = 'Stop'
    $source = [IO.File]::ReadAllText('scripts/prepare-ollama-runtime.ps1')
    $ast = [Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$null)
    $definition = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Assert-OfficialRuntimeTree' }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
    function Test-Path { return $true }
    function Get-ChildItem { return [pscustomobject]@{Name=$script:name;FullName=$script:name;Extension=[IO.Path]::GetExtension($script:name)} }
    function Get-AuthenticodeSignature { return [pscustomobject]@{Status=$script:status;SignerCertificate=[pscustomobject]@{Subject=$script:subject}} }
    $cases = @(
      @('ollama.exe','Valid','CN=Ollama Inc., O=Ollama Inc.', $true),
      @('msvcp140.dll','Valid','CN=Microsoft Corporation, O=Microsoft Corporation, C=US', $true),
      @('vcruntime140.dll','Valid','O=Microsoft Corporation', $true),
      @('vcruntime140_1.dll','Valid','O=Microsoft Corporation', $true),
      @('ollama.exe','Valid','O=Microsoft Corporation', $false),
      @('other.dll','Valid','O=Microsoft Corporation', $false),
      @('msvcp140.dll','HashMismatch','O=Microsoft Corporation', $false),
      @('msvcp140.dll','NotSigned','', $false),
      @('msvcp140.dll','Valid','CN=Microsoft Corporation, O=Unknown', $false),
      @('msvcp140.dll','Valid','O=Microsoft Corporation Impostor', $false)
    )
    foreach ($case in $cases) {
      $script:name,$script:status,$script:subject,$expected = $case
      $accepted = $true
      try { Assert-OfficialRuntimeTree -Root 'C:\\runtime' } catch { $accepted = $false }
      if ($accepted -ne $expected) { throw ('Unexpected signature acceptance: ' + $script:name + ' ' + $script:subject) }
    }
    Write-Output 'PASS signature acceptance matrix'
  `;
  const result = require('node:child_process').spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { cwd: path.join(__dirname, '..'), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /PASS signature acceptance matrix/);
});

 test('async audit preserves the same admission rules without blocking the event loop', async t => {
  const { auditOllamaRuntimeAsync }=require('../src/ai/ollama-runtime-security');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-async-audit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const executable=path.join(root,'ollama.exe');fs.writeFileSync(executable,'reviewed');
  const runner=fixtureRunner(),stages=[];let ticks=0;const timer=setInterval(()=>ticks++,2);t.after(()=>clearInterval(timer));
  const actual=await auditOllamaRuntimeAsync(executable,{platform:'win32',onStage:s=>stages.push(s.stage),runProcess:async(...args)=>{await new Promise(r=>setTimeout(r,15));return runner(...args)}});
  assert.deepEqual(actual,auditOllamaRuntime(executable,{platform:'win32',runProcess:runner}));
  assert.ok(ticks>=5);assert.deepEqual(stages,['identity','signature','version','vulnerabilities','identity-final']);
  for(const outcome of ['blocked','changed','cancelled']){
   const controller=new AbortController();
   await assert.rejects(auditOllamaRuntimeAsync(executable,{platform:'win32',signal:controller.signal,runProcess:async(command,args)=>{
    if(command==='grype'){
     if(outcome==='changed')fs.appendFileSync(executable,'tampered');
     if(outcome==='cancelled')controller.abort();
     if(outcome==='blocked')return fixtureRunner({findings:[{vulnerability:{id:'CVE-fixture',severity:'High'},artifact:{name:'fixture'}}]})(command,args);
    }return runner(command,args);
   }}),e=>outcome==='cancelled'?e.name==='AbortError':e.code===(outcome==='changed'?'OLLAMA_RUNTIME_CHANGED':'OLLAMA_RUNTIME_VULNERABLE'));
  }
 });
