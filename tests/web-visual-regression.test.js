const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../scripts/web-visual-regression');

function metrics() {
  return { title: 'NexusNXS AI', overflowX: 0, logo: { loaded: true, ratio: 1, width: .03, height: .04 },
    interactiveCount: 5, bodyTextLength: 26, core: { width: 1, height: .7 },
    publicUi: { ready: true, fontReady: true, assembled: true, heading: 'Chiedi. NexusNXS agisce.',
      controls: ['core','attachment','keyboard','profileSettings','download'].map(id => ({ id, label: id, visible: true, iconReady: true })) } };
}

test('il controllo visivo della UI minimale richiede azioni reali, non testo riempitivo', () => {
  assert.doesNotThrow(() => validate({ id: 'ai-desktop' }, metrics()));
  assert.throws(() => validate({ id: 'site-mobile' }, metrics()), /contenuto insufficiente/);
});

test('testi lunghi non nascondono icone mancanti, caricamento incompleto o Core vuoto', () => {
  const changes = [m => { m.publicUi = null; }, m => { m.publicUi.ready = false; },
    m => { m.publicUi.fontReady = false; }, m => { m.publicUi.assembled = false; },
    m => { m.publicUi.heading = ''; }, m => { m.core.width = 0; }, m => { m.logo.width = 0; },
    m => { m.publicUi.controls.pop(); }, m => { m.publicUi.controls[1].label = ''; },
    m => { m.publicUi.controls[2].visible = false; }, m => { m.publicUi.controls[3].iconReady = false; }];
  for (const change of changes) {
    const value = metrics(); value.bodyTextLength = 2000; change(value);
    assert.throws(() => validate({ id: 'ai-mobile' }, value));
  }
});
