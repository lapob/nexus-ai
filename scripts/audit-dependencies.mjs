import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// npm remains authoritative when available. Only a transport failure permits
// an independently documented OSV check; findings and malformed data fail closed.
export function nativeAuditOutcome(result) {
  let report;
  try { report = JSON.parse(result.stdout); } catch { /* Transport errors may not be JSON. */ }
  if (report?.metadata?.vulnerabilities) {
    if (result.status !== 0) throw new Error('npm found vulnerabilities above the release threshold.');
    return 'passed';
  }
  const detail = `${result.error?.code || ''} ${result.stdout || ''} ${result.stderr || ''}`;
  if (/ETIMEDOUT|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network timeout|FetchError|E50[234]|503 Service Unavailable/i.test(detail)) return 'unavailable';
  throw new Error('npm audit did not return a complete, trusted result.');
}

export function lockQueries(lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('Expected a complete npm v3 lockfile.');
  const unique = new Map();
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location) continue;
    const name = entry.name || location.split('node_modules/').at(-1);
    let origin = entry.resolved, owner = location;
    while (!origin && entry.inBundle && owner.includes('/node_modules/')) {
      owner = owner.slice(0, owner.lastIndexOf('/node_modules/'));
      origin = lock.packages[owner]?.resolved;
    }
    if (entry.link || !location.includes('node_modules/') || !name || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(entry.version || '') || !String(origin || '').startsWith('https://registry.npmjs.org/')) {
      throw new Error(`Dependency cannot be audited as an exact npm version: ${location}`);
    }
    unique.set(`${name}@${entry.version}`, { package: { ecosystem: 'npm', name }, version: entry.version });
  }
  if (!unique.size) throw new Error('No auditable dependencies.');
  return [...unique.values()];
}

export async function queryOsv(queries, request = fetch) {
  const findings = [];
  for (let offset = 0; offset < queries.length; offset += 100) {
    let pending = queries.slice(offset, offset + 100);
    const tokens = new Set();
    let pages = 0;
    while (pending.length) {
      if (++pages > 100) throw new Error('OSV pagination did not finish.');
      const response = await request('https://api.osv.dev/v1/querybatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: pending }), signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`OSV unavailable: HTTP ${response.status}.`);
      const data = await response.json();
      if (!Array.isArray(data.results) || data.results.length !== pending.length) throw new Error('Incomplete OSV coverage.');
      const next = [];
      for (let i = 0; i < pending.length; i++) {
        const row = data.results[i], query = pending[i];
        if (!row || typeof row !== 'object' || Array.isArray(row) || row.error || (row.vulns !== undefined && !Array.isArray(row.vulns))) throw new Error('Malformed OSV result.');
        for (const vulnerability of row.vulns || []) {
          if (typeof vulnerability?.id !== 'string' || !vulnerability.id) throw new Error('Invalid OSV finding.');
          findings.push({ name: query.package.name, version: query.version, id: vulnerability.id });
        }
        if (row.next_page_token) {
          if (typeof row.next_page_token !== 'string') throw new Error('Invalid OSV pagination token.');
          const key = `${query.package.name}@${query.version}:${row.next_page_token}`;
          if (tokens.has(key)) throw new Error('OSV returned a repeated page.');
          tokens.add(key);
          next.push({ ...query, page_token: row.next_page_token });
        }
      }
      pending = next;
    }
  }
  return findings;
}

async function main() {
  if (!process.env.npm_execpath) throw new Error('Run through npm run verify:security.');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json', '--audit-level=high', '--omit=optional', '--fetch-retries=0', '--fetch-timeout=12000'], { encoding: 'utf8', timeout: 35000, windowsHide: true });
  const outcome = nativeAuditOutcome(result);
  if (outcome === 'passed') { console.log('npm vulnerability audit passed.'); return; }
  console.warn('npm audit transport unavailable; auditing every locked dependency with OSV (including optional and development packages).');
  const source = await readFile('package-lock.json', 'utf8');
  const queries = lockQueries(JSON.parse(source));
  const findings = await queryOsv(queries);
  await mkdir('.qa-artifacts', { recursive: true });
  await writeFile('.qa-artifacts/dependency-audit.json', JSON.stringify({ provider: 'https://api.osv.dev/v1/querybatch', timestamp: new Date().toISOString(), lockSha256: createHash('sha256').update(source).digest('hex'), checked: queries.length, findings }, null, 2));
  if (findings.length) {
    for (const row of findings) console.error(`${row.name}@${row.version}: ${row.id}`);
    throw new Error('OSV found vulnerabilities. All severities block the fallback release gate.');
  }
  console.log(`OSV audit passed: ${queries.length} exact package versions, no known findings. Registry signature verification remains mandatory.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
