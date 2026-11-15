const test = require('node:test');
const assert = require('node:assert/strict');
const { liveTextBounds, mask } = require('../scripts/visual/run-android');
const { blank, decode, encode } = require('../scripts/visual/lib/png');

test('Control: si coprono solo i testi live di Control (cifre), non etichette né altre app', () => {
  const xml = `<hierarchy>
    <node text="PC non raggiungibile" package="local.nexus.console" bounds="[10,10][200,40]"/>
    <node text="CPU 42%" package="local.nexus.console" bounds="[10,50][120,80]"/>
    <node text="09:41" package="com.android.systemui" bounds="[0,0][60,20]"/>
    <node text="Aggiornato 3 min fa" package="local.nexus.console" bounds="[5,90][150,110]"/></hierarchy>`;
  assert.deepEqual(liveTextBounds(xml), [[10, 50, 120, 80], [5, 90, 150, 110]]);
});

test('Control: barra di stato e valori live coperti in modo identico, il resto intatto', () => {
  const source = blank(200, 300);
  source.data.fill(200);
  const out = decode(mask(encode(source), 160, [[10, 100, 20, 110]]));
  const pixel = (x, y) => Array.from(out.data.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 4));
  assert.deepEqual(pixel(5, 10), [0, 0, 0, 255]); // barra di stato (56 dp a 160 dpi = 56 px)
  assert.deepEqual(pixel(5, 56), [200, 200, 200, 200]);
  assert.deepEqual(pixel(15, 105), [0, 0, 0, 255]); // valore live
  assert.deepEqual(pixel(25, 105), [200, 200, 200, 200]);
});
