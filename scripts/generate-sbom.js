/**
 * @module scripts/generate-sbom
 * @description Genera una SBOM CycloneDX locale delle dipendenze NexusNXS.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// #region 01 — Generazione

const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli || !fs.existsSync(npmCli)) throw new Error('CLI npm non disponibile per la SBOM.');
const result = spawnSync(process.execPath, [npmCli, 'sbom', '--sbom-format', 'cyclonedx'], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
if (result.status !== 0) {
  process.stderr.write(result.stderr || 'Generazione SBOM non riuscita.\n');
  process.exitCode = 1;
} else {
  const parsed = JSON.parse(result.stdout);
  if (parsed.bomFormat !== 'CycloneDX' || !Array.isArray(parsed.components)) throw new Error('SBOM prodotta in formato inatteso.');
  const target = path.join(root, 'qa-artifacts', 'nexus-sbom.cdx.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  fs.writeFileSync(`${target}.sha256`, `${digest}  ${path.basename(target)}\n`, 'utf8');
  process.stdout.write(`SBOM CycloneDX generata: ${parsed.components.length} componenti.\n`);
}

// #endregion
