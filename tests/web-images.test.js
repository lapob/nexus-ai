const test = require('node:test');
const assert = require('node:assert/strict');
const { WebResearchService } = require('../src/research/web-research-service');
const { webImageQuery } = require('../src/shared/web-image-query');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const thumbnail = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.png/500px-Test.png?utm_source=commons.wikimedia.org';
function page(overrides = {}) {
  return { index: 1, title: 'File:Test.png', imageinfo: [{ mime: 'image/png', thumburl: thumbnail,
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Test.png',
    extmetadata: { Artist: { value: '<a>Artist</a>' }, LicenseShortName: { value: 'CC BY 4.0' } }, ...overrides }] };
}

test('extracts explicit public photo subjects without leaking local or attached context', () => {
  for (const input of ['Mostrami foto di Saturno', 'Cerca immagini dal web di Saturno', 'Show me pictures of Saturno']) assert.equal(webImageQuery(input), 'Saturno');
  for (const input of ['Genera una foto di Saturno', 'Descrivi la foto allegata', 'Mostrami foto di mia sorella', 'Cerca immagini di Z:\\private', 'Cerca immagini di token:abcdefgh', 'Mostrami foto di Saturno; e dei miei file']) assert.equal(webImageQuery(input), '');
});

test('retrieves attributed bounded raster previews only from fixed Wikimedia hosts', async () => {
  const calls = [];
  const service = new WebResearchService({ fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    if (new URL(url).hostname === 'commons.wikimedia.org') return Response.json({ query: { pages: { a: page() } } });
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  } });
  const result = await service.searchImages('Saturn');
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].author, 'Artist'); assert.equal(result.images[0].license, 'CC BY 4.0');
  assert.equal(result.images[0].url, `data:image/png;base64,${png.toString('base64')}`);
  assert.equal(new URL(calls[1].url).search, '');
  assert.ok(calls.every(call => call.options.redirect === 'error'));
  assert.equal(new URL(calls[0].url).searchParams.get('gsrsearch'), 'Saturn filetype:bitmap');
});

test('rejects arbitrary/private hosts, SVG, missing attribution and credentials without downloading', async () => {
  for (const override of [{ thumburl: 'https://127.0.0.1/private.png' }, { thumburl: 'https://thumb.wikimedia.org.evil.test/wikipedia/commons/a.png' },
    { thumburl: 'https://user:secret@thumb.wikimedia.org/wikipedia/commons/a.png' }, { thumburl: thumbnail + '&redirect=https://evil.test' },
    { descriptionurl: 'https://evil.test/wiki/File:Test.png' }, { mime: 'image/svg+xml' }, { extmetadata: {} }]) {
    let calls = 0;
    const service = new WebResearchService({ fetchImpl: async () => { calls++; return Response.json({ query: { pages: { a: page(override) } } }); } });
    assert.deepEqual((await service.searchImages('Saturn')).images, []); assert.equal(calls, 1);
  }
});

test('rejects MIME mismatch, oversized streams and redirects while preserving good results', async () => {
  for (const bad of [() => new Response('<svg/>', { headers: { 'content-type': 'image/png' } }),
    () => new Response(png, { headers: { 'content-type': 'text/html' } }),
    () => new Response(Buffer.alloc(256 * 1024 + 1), { headers: { 'content-type': 'image/png' } }),
    () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } })]) {
    const service = new WebResearchService({ fetchImpl: async url => new URL(url).hostname === 'commons.wikimedia.org'
      ? Response.json({ query: { pages: { a: page() } } }) : bad() });
    assert.deepEqual((await service.searchImages('Saturn')).images, []);
  }
});

test('disabled/private queries never leave the process and cancellation discards late images', async () => {
  let calls = 0;
  const service = new WebResearchService({ enabled: false, fetchImpl: async () => { calls++; throw new Error('unexpected'); } });
  await assert.rejects(service.searchImages('Saturn'), /disattivata/);
  service.enabled = true; await assert.rejects(service.searchImages('Z:\\private'), /non valido/); assert.equal(calls, 0);
  const controller = new AbortController();
  service.fetch = async () => { controller.abort(); return Response.json({ query: { pages: {} } }); };
  await assert.rejects(service.searchImages('Saturn', { signal: controller.signal }), /abort/i);
});
