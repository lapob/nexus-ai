import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockQueries, nativeAuditOutcome, queryOsv } from '../scripts/audit-dependencies.mjs';

const query = { package: { ecosystem: 'npm', name: 'react' }, version: '19.2.8' };
const response = results => ({ ok: true, json: async () => ({ results }) });

test('npm findings never fall back; only transport failures do', () => {
  assert.equal(nativeAuditOutcome({ status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { high: 0 } } }) }), 'passed');
  assert.throws(() => nativeAuditOutcome({ status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities: { high: 1 } } }), stderr: 'network timeout' }));
  assert.equal(nativeAuditOutcome({ status: 1, stderr: 'network timeout at registry.npmjs.org' }), 'unavailable');
  assert.throws(() => nativeAuditOutcome({ status: 1, stderr: 'E401' }));
  assert.throws(() => nativeAuditOutcome({ status: 0, stdout: '{}' }));
});

test('every locked package is queried including optional/dev; aliases use real names', () => {
  const entry = { version: '19.2.8', resolved: 'https://registry.npmjs.org/react/-/react-19.2.8.tgz', optional: true, dev: true };
  assert.deepEqual(lockQueries({ lockfileVersion: 3, packages: { '': {}, 'node_modules/react': entry, 'node_modules/alias': { ...entry, name: 'react' } } }), [query]);
  assert.throws(() => lockQueries({ lockfileVersion: 3, packages: { 'node_modules/private': { version: '1.0.0', resolved: 'file:../private' } } }));
  assert.equal(lockQueries({ lockfileVersion: 3, packages: { 'node_modules/react': entry, 'node_modules/react/node_modules/tslib': { version: '2.8.1', inBundle: true } } }).length, 2);
});

test('OSV follows pagination and retains all findings', async () => {
  const calls = [];
  const findings = await queryOsv([query], async (url, options) => {
    calls.push(JSON.parse(options.body));
    return calls.length === 1 ? response([{ next_page_token: 'next', vulns: [{ id: 'GHSA-first' }] }]) : response([{ vulns: [{ id: 'GHSA-second' }] }]);
  });
  assert.equal(calls[1].queries[0].page_token, 'next');
  assert.deepEqual(findings.map(row => row.id), ['GHSA-first', 'GHSA-second']);
});

test('OSV incomplete, failed or looping responses fail closed', async () => {
  await assert.rejects(queryOsv([query], async () => response([])), /Incomplete/);
  await assert.rejects(queryOsv([query], async () => ({ ok: false, status: 503 })), /unavailable/);
  await assert.rejects(queryOsv([query], async () => response([{ error: 'timeout' }])), /Malformed/);
  await assert.rejects(queryOsv([query], async () => response([{ next_page_token: 'same' }])), /repeated/);
  assert.deepEqual(await queryOsv([query], async () => response([{}])), []);
});
