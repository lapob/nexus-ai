const test = require('node:test');
const assert = require('node:assert/strict');
const { SANDBOX_HOST_HTML, sandboxHostPolicy } = require('../src/shared/sandbox-host');
const { shouldBlockRendererRequest } = require('../src/infrastructure/electron/app-lifecycle');
const { CONTENT_SECURITY_POLICY } = require('../src/infrastructure/electron/renderer-protocol');

test('la pagina ospite della sandbox non concede rete, form, navigazione o incorniciatura estranea', () => {
  const policy = sandboxHostPolicy('nexus://app');
  for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "worker-src 'none'", 'frame-ancestors nexus://app']) {
    assert.ok(policy.includes(directive), directive);
  }
  assert.doesNotMatch(policy, /https?:|\*/);
  assert.match(SANDBOX_HOST_HTML, /event\.source!==parent/);
  assert.match(SANDBOX_HOST_HTML, /nexus-sandbox-render/);
});

test('il renderer desktop può caricare solo la pagina ospite, e solo come frame', () => {
  assert.equal(shouldBlockRendererRequest('nexus-sandbox://run/v1'), false);
  for (const url of ['nexus-sandbox://run/v2', 'nexus-sandbox://run/v1?x=1', 'nexus-sandbox://altro/v1', 'https://nexusnxs.com/sandbox/v1']) {
    assert.equal(shouldBlockRendererRequest(url), true, url);
  }
  assert.match(CONTENT_SECURITY_POLICY, /frame-src nexus-sandbox:\/\/run;/);
  assert.match(CONTENT_SECURITY_POLICY, /connect-src 'none'/);
});
