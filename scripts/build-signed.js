/**
 * @module scripts/build-signed
 * @description Impedisce di pubblicare per errore un installer privo di firma fiduciaria: richiede una modalità di
 * firma completa (Azure Artifact Signing o certificato .pfx), costruisce e poi verifica la firma Authenticode
 * dell'installer con Windows stesso. Nessun segreto viene stampato.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { windowsSigning } = require('./lib/windows-signing');

const status = windowsSigning(process.env);
if (!status.ready) {
  const detail = [...status.missing, ...status.invalid.map((name) => `${name} non valido`)].join(', ');
  console.error(`Firma non configurata (${status.mode ?? 'nessuna modalità'}): ${detail}. Vedi docs/WINDOWS-SIGNING.md.`);
  process.exit(2);
}
console.log(`Firma Windows: modalità ${status.mode === 'azure' ? 'Azure Artifact Signing' : 'certificato .pfx'}.`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build:win'], { stdio: 'inherit', env: process.env, windowsHide: true, shell: process.platform === 'win32' });
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

const root = path.resolve(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const installer = path.join(root, 'release', `NexusNXS-${version}-Setup.exe`);
if (process.platform === 'win32' && fs.existsSync(installer)) {
  // Il percorso passa come argomento, mai interpolato nel comando.
  const probe = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
    '$s = Get-AuthenticodeSignature -LiteralPath $args[0]; "$($s.Status)|$($s.SignerCertificate.Subject)|$([bool]$s.TimeStamperCertificate)"', installer],
  { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  const [state, subject, stamped] = String(probe.stdout || '').trim().split('|');
  if (state !== 'Valid' || stamped !== 'True') {
    console.error(`Installer non firmato correttamente: stato ${state || 'sconosciuto'}, marca temporale ${stamped === 'True' ? 'presente' : 'assente'}.`);
    process.exit(3);
  }
  console.log(`Installer firmato e verificato · ${subject}`);
}
