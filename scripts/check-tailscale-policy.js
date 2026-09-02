/**
 * @module scripts/check-tailscale-policy
 * @description Controlla una policy Grants NexusNXS deny-by-default prima del caricamento nella tailnet.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function parseHujson(source) {
  const withoutComments = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return JSON.parse(withoutComments.replace(/,\s*([}\]])/g, '$1'));
}

function inspectPolicy(policy, { strict = false } = {}) {
  const failures = [];
  const grants = Array.isArray(policy?.grants) ? policy.grants : [];
  const tests = Array.isArray(policy?.tests) ? policy.tests : [];
  if (!grants.length) failures.push('nessun grant definito');
  if (!tests.length) failures.push('nessun test positivo/negativo definito');
  const encoded = JSON.stringify(policy);
  if (/"\*"|\*:\*/.test(encoded)) failures.push('wildcard globale vietata');
  if (strict && /<[^>]+>/.test(encoded)) failures.push('placeholder ancora presenti nella policy attiva');
  for (const grant of grants) {
    if (!Array.isArray(grant.src) || !grant.src.length || !Array.isArray(grant.dst) || !grant.dst.length) failures.push('grant privo di sorgente o destinazione');
    for (const capability of grant.ip || []) {
      if (/:(?:22|32145|32147)$/.test(String(capability))) failures.push(`porta amministrativa esposta direttamente: ${capability}`);
    }
  }
  for (const test of tests) {
    const denied = test.deny || [];
    if (!denied.some((entry) => /:22$/.test(entry))) failures.push(`test ${test.src || '-'} non nega SSH`);
    if (!denied.some((entry) => /:3214[57]$/.test(entry))) failures.push(`test ${test.src || '-'} non nega il gateway diretto`);
  }
  return { passed: failures.length === 0, grants: grants.length, tests: tests.length, failures };
}

function main() {
  const strict = process.argv.includes('--strict');
  const explicit = process.argv.find((entry) => entry.startsWith('--file='))?.slice('--file='.length);
  const localPolicy = path.join(root, 'config', 'tailscale-grants.local');
  const policyPath = path.resolve(
    explicit
      || process.env.NEXUS_TAILSCALE_POLICY
      || (fs.existsSync(localPolicy) ? localPolicy : path.join(root, 'config', 'tailscale-grants.example.hujson')),
  );
  const report = inspectPolicy(parseHujson(fs.readFileSync(policyPath, 'utf8')), { strict });
  console.log(`Tailscale Grants: ${report.grants} grant, ${report.tests} test, ${report.failures.length} errori.`);
  if (report.failures.length) {
    console.error(report.failures.map((entry) => `- ${entry}`).join('\n'));
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { inspectPolicy, parseHujson };
