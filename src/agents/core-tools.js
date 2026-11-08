/**
 * @module agents/core-tools
 * @description Strumenti di base dell'agente: ora, calcolo esatto, knowledge locale e ricerca web con dipendenze iniettate.
 */

// #region 01 — Calcolatrice sicura

// Parser a discesa ricorsiva: niente eval, solo numeri, + - * / % ^,
// parentesi e poche funzioni. Il modello delega qui i calcoli invece di
// stimarli token per token.
const FUNCTIONS = Object.freeze({
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  ln: Math.log, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp
});
const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });

function evaluateExpression(source) {
  const text = String(source || '').replace(/(\d),(\d)/g, '$1.$2').replace(/×/g, '*').replace(/÷/g, '/').trim();
  if (!text || text.length > 200) throw new Error('Espressione vuota o troppo lunga.');
  const tokens = text.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?|[a-z][a-z0-9]*|[-+*/%^()]|\S/gi) || [];
  let index = 0;
  const peek = () => tokens[index];
  const take = (expected) => {
    const token = tokens[index];
    if (expected !== undefined && token !== expected) throw new Error(`Atteso «${expected}».`);
    index += 1;
    return token;
  };
  function primary() {
    const token = peek();
    if (token === undefined) throw new Error('Espressione incompleta.');
    if (token === '(') { take('('); const value = sum(); take(')'); return value; }
    if (/^\d/.test(token)) return Number(take());
    const name = token.toLowerCase();
    if (Object.hasOwn(CONSTANTS, name)) { take(); return CONSTANTS[name]; }
    if (Object.hasOwn(FUNCTIONS, name)) { take(); take('('); const value = sum(); take(')'); return FUNCTIONS[name](value); }
    throw new Error(`Simbolo non consentito: ${token}`);
  }
  // Precedenza matematica: -2^2 = -(2^2); l'esponente è associativo a destra
  // e può essere negativo (2^-1).
  function power() {
    const base = primary();
    if (peek() === '^') { take(); return base ** unary(); }
    return base;
  }
  function unary() {
    if (peek() === '-') { take(); return -unary(); }
    if (peek() === '+') { take(); return unary(); }
    return power();
  }
  function product() {
    let value = unary();
    while (['*', '/', '%'].includes(peek())) {
      const operator = take();
      const right = unary();
      if ((operator === '/' || operator === '%') && right === 0) throw new Error('Divisione per zero.');
      value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
    }
    return value;
  }
  function sum() {
    let value = product();
    while (['+', '-'].includes(peek())) value = take() === '+' ? value + product() : value - product();
    return value;
  }
  const result = sum();
  if (index !== tokens.length) throw new Error(`Simbolo inatteso: ${peek()}`);
  if (!Number.isFinite(result)) throw new Error('Risultato non finito.');
  return Number.parseFloat(result.toPrecision(15));
}

// #endregion

// #region 02 — Catalogo strumenti di base

function isValidTimeZone(timeZone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true; } catch { return false; }
}

// Date di calendario come giorni UTC interi: niente ore legali o fusi nel
// conteggio. "Oggi" è la data locale del fuso richiesto.
function calendarDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? time / 86_400_000 : null;
}

function localIsoDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function isoFromDay(day) { return new Date(day * 86_400_000).toISOString().slice(0, 10); }

/**
 * Registra gli strumenti di base nel registro tipizzato. Knowledge e ricerca
 * web vengono registrati solo se il servizio è iniettato: nessun comando
 * esposto al modello senza un backend reale.
 */
function registerCoreTools(registry, { knowledgeIndex = null, embed = null, webResearch = null, now = () => new Date(), locale = 'it-IT', defaultTimeZone } = {}) {
  registry.register({
    name: 'current-time',
    description: 'Restituisce data e ora correnti, giorno della settimana e fuso orario. Usalo per domande su oggi, ora, date relative o scadenze.',
    audience: 'public', risk: 'low', timeoutMs: 1_000,
    parameters: { type: 'object', properties: { timeZone: { type: 'string', description: 'Fuso IANA, ad esempio Europe/Rome.', maxLength: 64, pattern: '^[A-Za-z_]+(?:/[A-Za-z0-9_+-]+){0,2}$' } } },
    invoke: ({ timeZone } = {}) => {
      const zone = timeZone || defaultTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!isValidTimeZone(zone)) throw Object.assign(new Error('Fuso orario sconosciuto.'), { code: 'TOOL_ARGUMENTS_INVALID' });
      const date = now();
      return {
        iso: date.toISOString(), timeZone: zone,
        local: new Intl.DateTimeFormat(locale, { timeZone: zone, dateStyle: 'full', timeStyle: 'short' }).format(date)
      };
    }
  });

  registry.register({
    name: 'calculate',
    description: 'Calcola in modo esatto un\'espressione aritmetica: + - * / % ^, parentesi, sqrt, abs, round, floor, ceil, ln, log10, sin, cos, tan, exp, pi, e. Usalo sempre invece di calcolare a mente.',
    audience: 'public', risk: 'low', timeoutMs: 1_000,
    parameters: { type: 'object', required: ['expression'], properties: { expression: { type: 'string', minLength: 1, maxLength: 200, description: 'Espressione, ad esempio (1250*0.22)+sqrt(16).' } } },
    invoke: ({ expression }) => ({ expression, value: evaluateExpression(expression) })
  });

  registry.register({
    name: 'date-diff',
    description: 'Calcola in modo esatto i giorni tra due date (YYYY-MM-DD) oppure la data dopo N giorni. Se from manca usa la data di oggi. Usalo per «quanti giorni mancano», scadenze e anniversari.',
    audience: 'public', risk: 'low', timeoutMs: 1_000,
    parameters: { type: 'object', properties: {
      from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data iniziale, predefinita oggi.' },
      to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data finale.' },
      addDays: { type: 'integer', minimum: -36600, maximum: 36600, description: 'Giorni da aggiungere a from, in alternativa a to.' },
      timeZone: { type: 'string', maxLength: 64, pattern: '^[A-Za-z_]+(?:/[A-Za-z0-9_+-]+){0,2}$' }
    } },
    invoke: ({ from, to, addDays, timeZone } = {}) => {
      const zone = timeZone || defaultTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!isValidTimeZone(zone)) throw Object.assign(new Error('Fuso orario sconosciuto.'), { code: 'TOOL_ARGUMENTS_INVALID' });
      const start = calendarDay(from || localIsoDate(now(), zone));
      if (start === null) throw Object.assign(new Error('Data iniziale non valida.'), { code: 'TOOL_ARGUMENTS_INVALID' });
      if ((to === undefined) === (addDays === undefined)) throw Object.assign(new Error('Indica to oppure addDays.'), { code: 'TOOL_ARGUMENTS_INVALID' });
      if (addDays !== undefined) return { from: isoFromDay(start), addDays, date: isoFromDay(start + addDays) };
      const end = calendarDay(to);
      if (end === null) throw Object.assign(new Error('Data finale non valida.'), { code: 'TOOL_ARGUMENTS_INVALID' });
      return { from: isoFromDay(start), to: isoFromDay(end), days: end - start };
    }
  });

  if (knowledgeIndex && typeof knowledgeIndex.search === 'function') {
    registry.register({
      name: 'search-knowledge',
      description: 'Cerca nelle note locali dell\'utente (vault Markdown) e restituisce estratti con titolo e percorso relativo. Usalo per progetti, appunti e documenti personali.',
      audience: 'private', risk: 'low', timeoutMs: 15_000,
      parameters: { type: 'object', required: ['query'], properties: {
        query: { type: 'string', minLength: 2, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: 8 }
      } },
      invoke: async ({ query, limit = 5 }, { signal } = {}) => {
        let vector = null;
        if (typeof embed === 'function' && typeof knowledgeIndex.searchHybrid === 'function') {
          try { vector = (await embed(query, { signal }))?.vectors?.[0] || null; } catch { vector = null; }
        }
        const hits = vector ? knowledgeIndex.searchHybrid(query, vector, limit) : knowledgeIndex.search(query, limit);
        return hits.slice(0, limit).map((hit) => ({
          title: hit.title, heading: hit.heading, path: hit.relativePath, status: hit.status,
          excerpt: String(hit.text || '').slice(0, 700)
        }));
      }
    });
  }

  if (webResearch && typeof webResearch.search === 'function') {
    registry.register({
      name: 'web-search',
      description: 'Cerca sul web informazioni aggiornate e restituisce titolo, URL e estratto delle fonti. Usalo per notizie, versioni, prezzi o fatti recenti; cita sempre gli URL usati.',
      audience: 'public', risk: 'medium', timeoutMs: 30_000,
      parameters: { type: 'object', required: ['query'], properties: {
        query: { type: 'string', minLength: 2, maxLength: 300 },
        timeRange: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
        language: { type: 'string', pattern: '^[a-z]{2}$' }
      } },
      invoke: async ({ query, timeRange = '', language = 'it' }, { signal } = {}) => {
        // Non tutti i provider supportano ogni filtro (SearXNG non ha "week"):
        // ripiega una volta senza filtro e lo dichiara, invece di fallire.
        let response;
        let timeRangeApplied = Boolean(timeRange);
        try { response = await webResearch.search(query, { limit: 5, language, signal, timeRange }); }
        catch (error) {
          if (!timeRange || signal?.aborted) throw error;
          response = await webResearch.search(query, { limit: 5, language, signal, timeRange: '' });
          timeRangeApplied = false;
        }
        return {
          provider: response.provider, retrievedAt: response.retrievedAt,
          ...(timeRange ? { timeRange, timeRangeApplied } : {}),
          results: (response.results || []).slice(0, 5).map((item) => ({ title: item.title, url: item.url, snippet: String(item.snippet || '').slice(0, 600) }))
        };
      }
    });
  }
  return registry;
}

// #endregion

module.exports = { registerCoreTools, evaluateExpression };
