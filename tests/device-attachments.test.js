const test = require('node:test');
const assert = require('node:assert/strict');
const { deviceAttachments, guestAttachments } = require('../src/remote/remote-session-gateway');

const b64 = (text) => Buffer.from(text).toString('base64');

test('il telefono del proprietario allega file senza limite di numero e li legge per intero', async () => {
  const big = `${'riga normale\n'.repeat(400_000)}CODICE FINALE 7781\n`;
  assert.ok(big.length > 5_000_000, 'oltre i 1,5 MB degli ospiti');
  const files = Array.from({ length: 5 }, (_, index) => ({ name: `nota-${index}.txt`, mime: 'text/plain', data: b64(`contenuto ${index}`) }));
  const result = await deviceAttachments([...files, { name: 'registro.log', mime: 'text/plain', data: b64(big) }]);
  for (let index = 0; index < 5; index += 1) assert.match(result.context, new RegExp(`contenuto ${index}`));
  assert.match(result.context, /CODICE FINALE 7781/, 'nessun taglio a 120.000 caratteri');
  await assert.rejects(() => guestAttachments([{ name: 'registro.log', mime: 'text/plain', data: b64(big) }]), /troppo grande/, 'gli ospiti restano limitati');
});

test('PDF col profilo proprietario, file sensibili esclusi, immagini oltre il limite del modello dichiarate', async () => {
  let profile = '';
  const png = b64('finta-immagine');
  const result = await deviceAttachments([
    { name: 'contratto.pdf', mime: 'application/pdf', data: b64('%PDF-1.4') },
    { name: '.env', mime: 'text/plain', data: b64('TOKEN=segreto') },
    { name: 'a.png', mime: 'image/png', data: png },
    { name: 'b.png', mime: 'image/png', data: png },
    { name: 'c.png', mime: 'image/png', data: png }
  ], { extractPdf: async (_bytes, options) => { profile = options.profile; return { text: 'clausola 4.2' }; } });
  assert.equal(profile, 'owner');
  assert.match(result.context, /clausola 4\.2/);
  assert.doesNotMatch(result.context, /segreto/);
  assert.match(result.context, /\.env\nContenuto non incluso \(file sensibile\)/);
  assert.equal(result.images.length, 2);
  assert.match(result.context, /IMMAGINE: c\.png\nNon inclusa/);
});

test('formati non ammessi vengono rifiutati', async () => {
  await assert.rejects(() => deviceAttachments([{ name: 'x.exe', mime: 'application/x-msdownload', data: b64('MZ') }]), /non supportato/);
  assert.deepEqual(await deviceAttachments(undefined), { context: '', images: [] });
});
