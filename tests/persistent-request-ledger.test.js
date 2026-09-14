const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PersistentRequestLedger } = require('../src/remote/persistent-request-ledger');

test('il ledger persiste risultato, cursore e conflitti di idempotenza', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-'));
  const filePath = path.join(root, 'requests.json');
  const key = 'a'.repeat(64);
  try {
    const ledger = new PersistentRequestLedger({ filePath, persistDelayMs: 0 });
    assert.equal(ledger.begin(key, 'fingerprint').state, 'started');
    assert.equal(ledger.append(key, 'Ciao '), 5);
    assert.equal(ledger.append(key, 'mondo'), 10);
    ledger.complete(key, { message: 'Ciao mondo', completedAt: 42 });

    const restarted = new PersistentRequestLedger({ filePath, persistDelayMs: 0 });
    assert.equal(restarted.inspect(key, 'fingerprint').state, 'complete');
    assert.equal(restarted.inspect(key, 'different').state, 'conflict');
    assert.deepEqual(restarted.replay(key, 5), {
      cursor: 10, token: 'mondo', state: 'complete', result: { message: 'Ciao mondo', completedAt: 42 }
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('un riavvio consente retry solo se non era stato emesso alcun token', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-restart-'));
  const filePath = path.join(root, 'requests.json');
  try {
    const emptyKey = 'b'.repeat(64);
    const partialKey = 'c'.repeat(64);
    const ledger = new PersistentRequestLedger({ filePath, persistDelayMs: 0 });
    ledger.begin(emptyKey, 'empty');
    ledger.begin(partialKey, 'partial');
    ledger.append(partialKey, 'Risposta parziale');
    ledger.close();

    const restarted = new PersistentRequestLedger({ filePath, persistDelayMs: 0 });
    assert.equal(restarted.inspect(emptyKey, 'empty').state, 'missing');
    assert.equal(restarted.inspect(partialKey, 'partial').state, 'interrupted');
    assert.equal(restarted.replay(partialKey, 9).token, 'parziale');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('la scadenza TTL elimina richieste vecchie senza conservare dati indefinitamente', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-ttl-'));
  const filePath = path.join(root, 'requests.json');
  let now = 100_000;
  try {
    const ledger = new PersistentRequestLedger({ filePath, ttlMs: 60_000, now: () => now, persistDelayMs: 0 });
    const key = 'd'.repeat(64);
    ledger.begin(key, 'ttl');
    ledger.complete(key, { message: 'ok', completedAt: now });
    now += 60_001;
    assert.equal(ledger.inspect(key, 'ttl').state, 'missing');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ratings persist and change without extending conversation retention', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-rating-'));
  let now = 100000;
  const filePath = path.join(root, 'requests.json'), key = 'd'.repeat(64);
  try {
    const ledger = new PersistentRequestLedger({ filePath, ttlMs: 60000, now: () => now });
    ledger.begin(key, 'f');
    assert.equal(ledger.rate(key, 1), false);
    ledger.complete(key, { message: 'Synthetic response' });
    now += 1000;
    assert.equal(ledger.rate(key, 1), true);
    assert.equal(new PersistentRequestLedger({ filePath, now: () => now }).inspect(key, 'f').entry.rating, 1);
    assert.equal(ledger.rate(key, -1), true);
    assert.equal(ledger.rate(key, 0), true);
    assert.equal(ledger.rate(key, '1'), false);
    assert.equal(ledger.inspect(key, 'f').entry.rating, 0);
    assert.equal(ledger.inspect(key, 'f').entry.updatedAt, 100000);
    now += 60000;
    assert.equal(ledger.rate(key, 1), false);
    ledger.close();
  } finally { fs.rmSync(root, {recursive:true,force:true}); }
});

test('restart does not revive expired partial responses or extend their retention', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-expiry-'));
  const filePath = path.join(root, 'requests.json');
  let now = 100000;
  const key = 'e'.repeat(64);
  try {
    const first = new PersistentRequestLedger({ filePath, ttlMs:60000, now:()=>now });
    first.begin(key,'f');first.append(key,'partial');first.close();
    now += 30000;
    const recovered = new PersistentRequestLedger({ filePath, ttlMs:60000, now:()=>now });
    assert.equal(recovered.inspect(key,'f').state,'interrupted');
    assert.equal(recovered.inspect(key,'f').entry.updatedAt,100000);
    now += 30001;
    const expired = new PersistentRequestLedger({ filePath, ttlMs:60000, now:()=>now });
    assert.equal(expired.replay(key).state,'missing');
    assert.equal(JSON.parse(fs.readFileSync(filePath,'utf8')).entries[key],undefined);
    expired.close();
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('replay checks expiry even if no other request inspected the ledger', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-replay-expiry-'));
  let now=100000;
  const key='f'.repeat(64);
  const ledger=new PersistentRequestLedger({filePath:path.join(root,'requests.json'),ttlMs:60000,now:()=>now});
  try {
    ledger.begin(key,'f');ledger.complete(key,{message:'expired'});
    now+=60001;
    assert.deepEqual(ledger.replay(key),{cursor:0,token:'',state:'missing',result:null});
  } finally {ledger.close();fs.rmSync(root,{recursive:true,force:true});}
});
