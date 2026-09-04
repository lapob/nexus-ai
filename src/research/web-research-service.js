/**
 * @module research/web-research-service
 * @description Ricerca pubblica server-side con provider consentiti, cache breve e output normalizzato.
 */

const { createHash } = require('node:crypto');

// #region 01 — Normalizzazione e cancellazione

const MAX_RESPONSE_BYTES = 1_000_000;
const PROVIDERS = new Set(['auto', 'brave', 'openai', 'wikipedia']);
const DEFAULT_OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

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

function safeProviderEndpoint(value, fallback = '') {
  const raw = String(value || fallback || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
    throw new Error('Endpoint del provider di ricerca non sicuro.');
  }
  return url.toString();
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
  constructor({ enabled = true, provider = 'auto', braveApiKey = '', openAiApiKey = '', openAiModel = '', openAiEndpoint = DEFAULT_OPENAI_RESPONSES_URL, timeoutMs = 6000, cacheTtlMs = 300_000, fetchImpl = globalThis.fetch, logger = null, now = () => Date.now() } = {}) {
    const normalizedProvider = String(provider || 'auto').toLowerCase();
    if (!PROVIDERS.has(normalizedProvider)) throw new Error('Provider di ricerca web non consentito.');
    if (typeof fetchImpl !== 'function') throw new Error('Runtime fetch non disponibile per la ricerca web.');
    this.enabled = enabled !== false;
    this.provider = normalizedProvider;
    this.braveApiKey = String(braveApiKey || '').trim();
    this.openAiApiKey = String(openAiApiKey || '').trim();
    this.openAiModel = String(openAiModel || '').trim().slice(0, 160);
    this.openAiEndpoint = safeProviderEndpoint(openAiEndpoint, DEFAULT_OPENAI_RESPONSES_URL);
    this.timeoutMs = Math.max(800, Math.min(15_000, Number(timeoutMs) || 6000));
    this.cacheTtlMs = Math.max(10_000, Math.min(900_000, Number(cacheTtlMs) || 300_000));
    this.fetch = fetchImpl;
    this.logger = logger;
    this.now = now;
    this.cache = new Map();
    this.lastLiveFailureAt = 0;
  }

  activeProvider() {
    if (!this.enabled) return 'off';
    if (this.provider === 'brave') return this.braveApiKey ? 'brave' : 'unavailable';
    if (this.provider === 'openai') return this.openAiApiKey && this.openAiModel ? 'openai' : 'unavailable';
    if (this.provider === 'wikipedia') return 'wikipedia';
    if (this.braveApiKey) return 'brave';
    if (this.openAiApiKey && this.openAiModel) return 'openai';
    return 'wikipedia';
  }

  capabilityState() {
    const provider = this.activeProvider();
    if (provider === 'off' || provider === 'unavailable') return { state: 'unavailable', mode: 'off' };
    if (provider === 'wikipedia') return { state: 'degraded', mode: 'reference-only' };
    if (this.lastLiveFailureAt && this.now() - this.lastLiveFailureAt < this.cacheTtlMs) {
      return { state: 'degraded', mode: 'live-retrying' };
    }
    return { state: 'available', mode: 'live' };
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
    return { provider: cached.provider, results: cached.results.map((item) => ({ ...item })) };
  }

  writeCache(key, results, provider = '') {
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { expiresAt: this.now() + this.cacheTtlMs, provider, results: results.map((item) => ({ ...item })) });
  }

  async requestJson(url, { method = 'GET', headers = {}, body, signal } = {}) {
    const controller = new AbortController();
    const unlink = linkAbortSignal(controller, signal);
    const timer = setTimeout(() => controller.abort(new Error('Timeout ricerca web.')), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          // Wikimedia e altri provider pubblici richiedono un client
          // identificabile; non include installazione, utente o workstation.
          'User-Agent': 'NexusNXS/0.3 (+https://nexusnxs.com)',
          ...headers
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

  async searchOpenAI(query, { limit, signal }) {
    const payload = await this.requestJson(this.openAiEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openAiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model: this.openAiModel,
        input: `Trova fonti pubbliche verificabili per questa ricerca: ${query}`,
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        max_tool_calls: 2,
        store: false
      },
      signal
    });
    const candidates = [];
    for (const item of payload?.output || []) {
      if (item?.type === 'web_search_call') candidates.push(...(item?.action?.sources || item?.results || []));
      for (const content of item?.content || []) {
        for (const annotation of content?.annotations || []) {
          if (annotation?.type === 'url_citation') candidates.push(annotation);
        }
      }
    }
    const fallbackSnippet = cleanText(payload?.output_text, 1200);
    const seen = new Set();
    return candidates.map((item, index) => {
      const url = safePublicUrl(item?.url);
      if (!url || seen.has(url)) return null;
      seen.add(url);
      let host = 'Fonte web';
      try { host = new URL(url).hostname.replace(/^www\./i, ''); } catch {}
      return {
        title: cleanText(item?.title || host, 220),
        url,
        snippet: cleanText(item?.snippet || item?.description || fallbackSnippet || `Fonte relativa a ${query}`, 1200),
        sourceKind: 'web',
        status: 'external',
        provider: 'openai',
        score: Math.max(0, limit - index)
      };
    }).filter(Boolean).slice(0, limit);
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

  async search(query, { limit = 4, language = 'it', signal, freshOnly = false } = {}) {
    const normalizedQuery = cleanText(query, 500);
    if (!this.enabled || normalizedQuery.length < 2) return { provider: 'off', results: [] };
    const provider = this.activeProvider();
    if (provider === 'unavailable') throw new Error('Il provider di ricerca live non dispone di credenziale e modello server-side completi.');
    if (freshOnly && !['brave', 'openai'].includes(provider)) {
      throw new Error('La ricerca web in tempo reale richiede un provider live configurato sul server.');
    }
    const boundedLimit = Math.max(1, Math.min(8, Number(limit) || 4));
    const key = this.cacheKey(provider, normalizedQuery, wikipediaLanguage(language), boundedLimit);
    const cached = this.readCache(key);
    if (cached) return { provider: cached.provider || provider, cached: true, results: cached.results };
    let completedProvider = provider;
    let results;
    try {
      results = provider === 'brave'
        ? await this.searchBrave(normalizedQuery, { limit: boundedLimit, signal })
        : provider === 'openai'
          ? await this.searchOpenAI(normalizedQuery, { limit: boundedLimit, signal })
          : await this.searchWikipedia(normalizedQuery, { limit: boundedLimit, language, signal });
      if (provider === 'brave' || provider === 'openai') this.lastLiveFailureAt = 0;
    } catch (error) {
      if ((provider === 'brave' || provider === 'openai') && !signal?.aborted) this.lastLiveFailureAt = this.now();
      // In modalita auto una credenziale Brave scaduta o un guasto temporaneo
      // non deve disattivare tutta la ricerca pubblica. Wikipedia resta un
      // fallback dichiarato e senza credenziali; la modalita brave esplicita,
      // invece, conserva l'errore per rendere visibile la configurazione errata.
      if (freshOnly || this.provider !== 'auto' || !['brave', 'openai'].includes(provider) || signal?.aborted) throw error;
      this.logger?.warn?.('Provider live non disponibile; uso il fallback Wikipedia.', { error });
      completedProvider = 'wikipedia';
      results = await this.searchWikipedia(normalizedQuery, { limit: boundedLimit, language, signal });
    }
    this.writeCache(key, results, completedProvider);
    this.logger?.info?.('Ricerca web completata.', { provider: completedProvider, results: results.length });
    return { provider: completedProvider, cached: false, results };
  }
}

// #endregion

module.exports = { DEFAULT_OPENAI_RESPONSES_URL, PROVIDERS, WebResearchService, cleanText, safeProviderEndpoint, safePublicUrl, wikipediaLanguage };
