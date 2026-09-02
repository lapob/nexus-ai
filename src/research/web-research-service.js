/**
 * @module research/web-research-service
 * @description Ricerca pubblica server-side con provider consentiti, cache breve e output normalizzato.
 */

const { createHash } = require('node:crypto');

// #region 01 — Normalizzazione e cancellazione

const MAX_RESPONSE_BYTES = 1_000_000;
const PROVIDERS = new Set(['auto', 'brave', 'wikipedia']);

function cleanText(value, max = 1200) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safePublicUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href.slice(0, 2048);
  } catch {
    return '';
  }
}

function wikipediaLanguage(language = '') {
  return String(language || '').toLowerCase().startsWith('it') ? 'it' : 'en';
}

function linkAbortSignal(controller, signal) {
  if (!signal) return () => {};
  if (signal.aborted) controller.abort(signal.reason);
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

// #endregion

// #region 02 — Provider server-side

class WebResearchService {
  constructor({ enabled = true, provider = 'auto', braveApiKey = '', timeoutMs = 6000, cacheTtlMs = 300_000, fetchImpl = globalThis.fetch, logger = null, now = () => Date.now() } = {}) {
    const normalizedProvider = String(provider || 'auto').toLowerCase();
    if (!PROVIDERS.has(normalizedProvider)) throw new Error('Provider di ricerca web non consentito.');
    if (typeof fetchImpl !== 'function') throw new Error('Runtime fetch non disponibile per la ricerca web.');
    this.enabled = enabled !== false;
    this.provider = normalizedProvider;
    this.braveApiKey = String(braveApiKey || '').trim();
    this.timeoutMs = Math.max(800, Math.min(15_000, Number(timeoutMs) || 6000));
    this.cacheTtlMs = Math.max(10_000, Math.min(900_000, Number(cacheTtlMs) || 300_000));
    this.fetch = fetchImpl;
    this.logger = logger;
    this.now = now;
    this.cache = new Map();
  }

  activeProvider() {
    if (!this.enabled) return 'off';
    if (this.provider === 'brave') return this.braveApiKey ? 'brave' : 'unavailable';
    if (this.provider === 'wikipedia') return 'wikipedia';
    return this.braveApiKey ? 'brave' : 'wikipedia';
  }

  cacheKey(provider, query, language, limit) {
    return createHash('sha256').update(`${provider}\n${language}\n${limit}\n${query}`).digest('hex');
  }

  readCache(key) {
    const cached = this.cache.get(key);
    if (!cached || cached.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    return cached.results.map((item) => ({ ...item }));
  }

  writeCache(key, results) {
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { expiresAt: this.now() + this.cacheTtlMs, results: results.map((item) => ({ ...item })) });
  }

  async requestJson(url, { headers = {}, signal } = {}) {
    const controller = new AbortController();
    const unlink = linkAbortSignal(controller, signal);
    const timer = setTimeout(() => controller.abort(new Error('Timeout ricerca web.')), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          // Wikimedia e altri provider pubblici richiedono un client
          // identificabile; non include installazione, utente o workstation.
          'User-Agent': 'NexusNXS/0.3 (+https://nexusnxs.com)',
          ...headers
        },
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Ricerca web non disponibile (${response.status}).`);
      const contentType = String(response.headers?.get?.('content-type') || '');
      if (contentType && !/json/i.test(contentType)) throw new Error('Il provider di ricerca non ha restituito JSON.');
      const raw = await response.text();
      if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Risposta del provider di ricerca troppo grande.');
      return JSON.parse(raw);
    } finally {
      clearTimeout(timer);
      unlink();
    }
  }

  async searchBrave(query, { limit, signal }) {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));
    url.searchParams.set('safesearch', 'moderate');
    url.searchParams.set('text_decorations', 'false');
    url.searchParams.set('spellcheck', 'true');
    const payload = await this.requestJson(url, {
      headers: { 'X-Subscription-Token': this.braveApiKey },
      signal
    });
    return (payload?.web?.results || []).slice(0, limit).map((item, index) => ({
      title: cleanText(item.title, 220),
      url: safePublicUrl(item.url),
      snippet: cleanText(item.description, 1200),
      sourceKind: 'web',
      status: 'external',
      provider: 'brave',
      score: Math.max(0, limit - index)
    })).filter((item) => item.title && item.url && item.snippet);
  }

  async searchWikipedia(query, { limit, language, signal }) {
    const locale = wikipediaLanguage(language);
    const url = new URL(`https://${locale}.wikipedia.org/w/api.php`);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', query);
    url.searchParams.set('utf8', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('srlimit', String(limit));
    const payload = await this.requestJson(url, { signal });
    return (payload?.query?.search || []).slice(0, limit).map((item, index) => {
      const title = cleanText(item.title, 220);
      return {
        title,
        url: safePublicUrl(`https://${locale}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`),
        snippet: cleanText(item.snippet, 1200),
        sourceKind: 'web',
        status: 'external',
        provider: 'wikipedia',
        score: Math.max(0, limit - index)
      };
    }).filter((item) => item.title && item.url && item.snippet);
  }

  async search(query, { limit = 4, language = 'it', signal } = {}) {
    const normalizedQuery = cleanText(query, 500);
    if (!this.enabled || normalizedQuery.length < 2) return { provider: 'off', results: [] };
    const provider = this.activeProvider();
    if (provider === 'unavailable') throw new Error('La ricerca Brave è configurata senza credenziale server.');
    const boundedLimit = Math.max(1, Math.min(8, Number(limit) || 4));
    const key = this.cacheKey(provider, normalizedQuery, wikipediaLanguage(language), boundedLimit);
    const cached = this.readCache(key);
    if (cached) return { provider, cached: true, results: cached };
    const results = provider === 'brave'
      ? await this.searchBrave(normalizedQuery, { limit: boundedLimit, signal })
      : await this.searchWikipedia(normalizedQuery, { limit: boundedLimit, language, signal });
    this.writeCache(key, results);
    this.logger?.info?.('Ricerca web completata.', { provider, results: results.length });
    return { provider, cached: false, results };
  }
}

// #endregion

module.exports = { PROVIDERS, WebResearchService, cleanText, safePublicUrl, wikipediaLanguage };
