const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SemanticResponseCache, cacheableQuestion, compatibleQuestions, similarity } = require('../src/infrastructure/storage/semantic-response-cache');

test('riusa solo risposte stabili nello stesso namespace', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-response-cache-'));
  const cache = new SemanticResponseCache({ filePath: path.join(root, 'cache.sqlite3') });
  t.after(() => { cache.close(); fs.rmSync(root, { recursive: true, force: true }); });
  assert.equal(cache.put('Come funziona una rete VLAN?', 'Una VLAN separa logicamente la rete.', { namespace: 'knowledge-a', model: 'fast' }), true);
  assert.equal(cache.find('Come funziona una rete VLAN?', { namespace: 'knowledge-b' }), null);
  const exact = cache.find('Come funziona una rete VLAN?', { namespace: 'knowledge-a' });
  assert.match(exact.answer, /separa/);
  assert.equal(exact.matchType, 'exact');
});

test('esclude dati temporali, azioni e segreti', () => {
  assert.equal(cacheableQuestion('Qual è il meteo oggi a Roma?'), false);
  assert.equal(cacheableQuestion('Apri il browser adesso'), false);
  assert.equal(cacheableQuestion('Dove salvo una API key segreta?'), false);
  assert.equal(cacheableQuestion('What is the weather today in Rome?'), false);
  assert.ok(similarity('spiega una rete vlan', 'spiega la rete vlan') > 0.6);
});

test('non confonde domande quasi identiche con negazioni o quantità diverse', () => {
  const enabled = 'Spiega con precisione come abilitare il firewall interno per 10 client senza accesso pubblico nella rete aziendale di test, con regole documentate, procedure ripetibili, verifiche periodiche, monitoraggio continuo e configurazione standard.';
  const disabled = 'Spiega con precisione come disabilitare il firewall interno per 10 client senza accesso pubblico nella rete aziendale di test, con regole documentate, procedure ripetibili, verifiche periodiche, monitoraggio continuo e configurazione standard.';
  const otherCount = 'Spiega con precisione come abilitare il firewall interno per 20 client senza accesso pubblico nella rete aziendale di test, con regole documentate, procedure ripetibili, verifiche periodiche, monitoraggio continuo e configurazione standard.';
  assert.ok(similarity(enabled, disabled) >= 0.92);
  assert.equal(compatibleQuestions(enabled, disabled), false);
  assert.equal(compatibleQuestions(enabled, otherCount), false);
});

test('protegge il testo della risposta quando è disponibile la cifratura locale', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-response-cache-secure-'));
  const cache = new SemanticResponseCache({
    filePath: path.join(root, 'cache.sqlite3'),
    encrypt: (value) => Buffer.from(value, 'utf8').toString('base64'),
    decrypt: (value) => Buffer.from(value, 'base64').toString('utf8')
  });
  t.after(() => { cache.close(); fs.rmSync(root, { recursive: true, force: true }); });
  cache.put('Come funziona il protocollo DNS?', 'Il DNS risolve i nomi in indirizzi.', { namespace: 'manuale' });
  const stored = cache.database.prepare('SELECT answer FROM response_cache LIMIT 1').get().answer;
  assert.match(stored, /^enc:/);
  assert.doesNotMatch(stored, /risolve i nomi/);
  assert.equal(cache.find('Come funziona il protocollo DNS?', { namespace: 'manuale' }).answer, 'Il DNS risolve i nomi in indirizzi.');
  assert.deepEqual(cache.stats(), { entries: 1, hits: 1 });
});
