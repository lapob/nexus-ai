/**
 * @module tests/verify-app-shutdown
 * @description Regressioni per l'attesa del contesto renderer durante la QA di chiusura.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { closePage, waitForRendererReady } = require('../scripts/verify-app-shutdown');

// #region 01 — Avvio CDP e fallimenti reali

function protocolError(code, message) {
  return Object.assign(new Error(message), { cdpError: { code, message } });
}

test('shutdown QA waits for the default context and complete document after startup navigation', async () => {
  const replies = [
    protocolError(-32000, 'Cannot find default execution context'),
    { readyState: 'complete', url: 'about:blank' },
    { readyState: 'loading', url: 'nexus://app/index.html' },
    protocolError(-32000, 'Execution context was destroyed.'),
    { readyState: 'interactive', url: 'nexus://app/index.html' },
    { readyState: 'complete', url: 'nexus://app/index.html' }
  ];
  let calls = 0;
  await waitForRendererReady(async (expression) => {
    assert.equal(expression, '({ readyState: document.readyState, url: location.href })');
    calls += 1;
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return reply;
  }, { pollMs: 0 });
  assert.equal(calls, 6);
});

test('shutdown QA does not retry JavaScript exceptions, transport errors or unrelated CDP failures', async () => {
  for (const error of [
    new Error('ReferenceError: document is not defined'),
    new Error('Il renderer non ha confermato il comando CDP.'),
    protocolError(-32000, 'Inspected target navigated or closed'),
    protocolError(-32602, 'Cannot find default execution context')
  ]) {
    let calls = 0;
    await assert.rejects(waitForRendererReady(async () => {
      calls += 1;
      throw error;
    }, { pollMs: 0 }), (actual) => actual === error);
    assert.equal(calls, 1);
  }
});

test('shutdown QA has a bounded wait when the execution context never appears', async () => {
  const contextError = protocolError(-32000, 'Cannot find default execution context');
  await assert.rejects(waitForRendererReady(async () => { throw contextError; }, {
    timeoutMs: 20,
    pollMs: 1
  }), (error) => {
    assert.match(error.message, /non ha completato il caricamento/);
    assert.equal(error.cause, contextError);
    return true;
  });
});

test('shutdown QA fails when a document remains incomplete', async () => {
  await assert.rejects(waitForRendererReady(async () => ({ readyState: 'loading', url: 'nexus://app/index.html' }), {
    timeoutMs: 20,
    pollMs: 1
  }), /non ha completato il caricamento/);
});

test('shutdown QA keeps CDP attached until UI exit and disposes it on success or failure', async () => {
  for (const exitError of [null, new Error('UI process did not exit')]) {
    let socket;
    class FakeWebSocket extends EventTarget {
      constructor() {
        super();
        socket = this;
        this.closed = false;
        this.commands = [];
        queueMicrotask(() => this.dispatchEvent(new Event('open')));
      }
      send(raw) {
        const command = JSON.parse(raw);
        this.commands.push(command.params.expression);
        const value = this.commands.length === 1
          ? { readyState: 'complete', url: 'nexus://app/index.html' }
          : true;
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ id: command.id, result: { result: { value } } })
        })));
      }
      close() { this.closed = true; }
    }
    const closing = closePage({ webSocketDebuggerUrl: 'ws://127.0.0.1/qa' }, async () => {
      assert.equal(socket.closed, false, 'timer scheduling must not detach CDP before UI exit');
      assert.equal(socket.commands.filter((expression) => expression.includes('window.close()')).length, 1);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(socket.closed, false);
      if (exitError) throw exitError;
      return 0;
    }, { WebSocketClass: FakeWebSocket });
    if (exitError) await assert.rejects(closing, (error) => error === exitError);
    else assert.equal(await closing, 0);
    assert.equal(socket.closed, true);
  }
});

// #endregion
