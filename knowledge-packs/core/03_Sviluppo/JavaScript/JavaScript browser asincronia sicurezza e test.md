---
title: JavaScript browser asincronia sicurezza e test
type: technical-guide
area: programming
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: official-docs
tags: [javascript, browser, async, security, testing]
aliases: [Manuale JavaScript browser]
---

# JavaScript browser asincronia sicurezza e test

## Runtime

JavaScript esegue uno stack alla volta. Promise e `queueMicrotask` alimentano la microtask queue; timer, input e rete producono task. Un callback lungo blocca rendering e interazione. Spezza lavoro pesante, usa Worker e misura con Performance panel.

```js
export async function requestJson(url, { signal, timeout = 8000 } = {}) {
  const timeoutSignal = AbortSignal.timeout(timeout);
  const combined = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
  const response = await fetch(url, {
    signal: combined,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('Formato inatteso');
  return response.json();
}
```

## Stato e DOM

Mantieni una fonte di verità. Deriva la UI dallo stato e cancella listener, timer e richieste alla distruzione del componente. Usa `textContent` per testo non fidato; `innerHTML` richiede sanitizzazione rigorosa e una policy Trusted Types.

```js
const controller = new AbortController();
button.addEventListener('click', load, { signal: controller.signal });
// teardown
controller.abort();
```

## Errori

Un errore previsto diventa risultato tipizzato o eccezione specifica. Registra contesto, non token o payload sensibili. Gestisci timeout, offline, risposta parziale, cancellazione, doppio click, race tra richieste e callback dopo teardown.

## Sicurezza client

- autorizzazione sempre sul server;
- CSP stretta, niente `unsafe-eval`;
- dipendenze minime e lockfile;
- URL costruiti con `URL`, non concatenazione;
- `postMessage` con origin esatto e schema validato;
- storage browser non adatto a segreti ad alto valore;
- proteggi mutazioni da CSRF secondo architettura;
- evita prototype pollution fondendo soltanto campi ammessi.

## Test

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npx playwright test
npm audit --omit=dev
```

Testa unità pure, integrazione API/DOM, end-to-end dei flussi essenziali, accessibilità e race. Usa clock e rete controllati; un test non deve dipendere da Internet o dall’ordine.

## Progetto

Realizza un task manager offline-first:

- schema dati versionato;
- IndexedDB;
- sync simulato con conflitti;
- ricerca e filtri;
- undo della cancellazione;
- import/export validato;
- test su doppio submit, storage corrotto, quota esaurita, offline e tab concorrenti.

## Fonti

- MDN JavaScript: https://developer.mozilla.org/en-US/docs/Web/JavaScript
- ECMAScript: https://tc39.es/ecma262/
- OWASP Cheat Sheet Series: https://cheatsheetseries.owasp.org/

## Collegamenti

- [[Indice - JavaScript]]
- [[03_Sviluppo/Linguaggi/JavaScript e TypeScript|JavaScript e TypeScript]]
- [[03_Sviluppo/APIs/Progettazione API contratti affidabilita e sicurezza|API affidabili]]
