/**
 * @module research/web-research-service
 * @description Ricerca pubblica server-side con provider consentiti, cache breve e output normalizzato.
 */

const { createHash } = require('node:crypto');
const { boundedResponseText, boundedResponseBytes } = require('../security/bounded-response');
const { detectImageMime } = require('../ai/image-generation-service');
const { PRIVATE_LITERAL_PATTERN } = require('./research-policy');

// #region 01 — Normalizzazione e cancellazione

const MAX_RESPONSE_BYTES = 1_000_000;
const PROVIDERS = new Set(['auto', 'searxng', 'brave', 'openai', 'wikipedia']);
const DEFAULT_OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_THUMBNAIL_BYTES = 256 * 1024;

function commonsUrl(value, thumbnail = false) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return '';
    if (!(thumbnail ? ['upload.wikimedia.org', 'thumb.wikimedia.org'] : ['commons.wikimedia.org']).includes(url.hostname)) return '';
    if (!url.pathname.startsWith(thumbnail ? '/wikipedia/commons/' : '/wiki/File:')) return '';
    if ([...url.searchParams.keys()].some(key => !thumbnail || !/^utm_(?:source|campaign|content)$/.test(key))) return '';
    url.search = '';
    return url.href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch { return ''; }
}

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

function safeSelfHostedEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase());
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    || url.username || url.password || url.hash || url.search) {
    throw new Error('NEXUS_SEARXNG_URL deve essere HTTPS oppure loopback HTTP e non contenere credenziali.');
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
  constructor({ enabled = true, cloudEnabled = false, provider = 'auto', searxngEndpoint = '', braveApiKey = '', openAiApiKey = '', openAiModel = '', openAiEndpoint = DEFAULT_OPENAI_RESPONSES_URL, timeoutMs = 6000, cacheTtlMs = 300_000, fetchImpl = globalThis.fetch, logger = null, now = () => Date.now() } = {}) {
    const normalizedProvider = String(provider || 'auto').toLowerCase();
    if (!PROVIDERS.has(normalizedProvider)) throw new Error('Provider di ricerca web non consentito.');
    if (typeof fetchImpl !== 'function') throw new Error('Runtime fetch non disponibile per la ricerca web.');
    this.enabled = enabled !== false;
    this.provider = normalizedProvider;
    this.searxngEndpoint = safeSelfHostedEndpoint(searxngEndpoint);
    this.braveApiKey = cloudEnabled === true ? String(braveApiKey || '').trim() : '';
    this.openAiApiKey = cloudEnabled === true ? String(openAiApiKey || '').trim() : '';
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
    if (this.provider === 'searxng') return this.searxngEndpoint ? 'searxng' : 'unavailable';
    if (this.provider === 'brave') return this.braveApiKey ? 'brave' : 'unavailable';
    if (this.provider === 'openai') return this.openAiApiKey && this.openAiModel ? 'openai' : 'unavailable';
    if (this.provider === 'wikipedia') return 'wikipedia';
    if (this.searxngEndpoint) return 'searxng';
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

  cacheKey(provider, query, language, limit, timeRange = '') {
    return createHash('sha256').update(`${provider}\n${language}\n${limit}\n${timeRange}\n${query}`).digest('hex');
  }

  readCache(key) {
    const cached = this.cache.get(key);
    if (!cached || cached.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    return { provider: cached.provider, retrievedAt: cached.retrievedAt, results: cached.results.map((item) => ({ ...item })) };
  }

  writeCache(key, results, provider = '', retrievedAt = '') {
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { expiresAt: this.now() + this.cacheTtlMs, provider, retrievedAt, results: results.map((item) => ({ ...item })) });
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
      const raw = await boundedResponseText(response, MAX_RESPONSE_BYTES, 'Risposta del provider di ricerca', controller.signal);
      return JSON.parse(raw);
    } finally {
      clearTimeout(timer);
      unlink();
    }
  }

  async searchImages(query, { signal, limit = 3 } = {}) {
    if (!this.enabled) throw new Error('Ricerca immagini disattivata.');
    const subject = String(query || '').trim();
    if (!subject || subject.length > 160 || PRIVATE_LITERAL_PATTERN.test(subject)) throw new Error('Soggetto pubblico non valido.');
    const count = Math.max(1, Math.min(3, Number(limit) || 3));
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search',
      gsrsearch: `${subject} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(count * 2),
      prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '480',
      iiextmetadatafilter: 'Artist|LicenseShortName|ImageDescription' }).toString();
    const payload = await this.requestJson(url, { signal });
    const candidates = Object.values(payload?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    const seen = new Set();
    const selected = candidates.flatMap(page => {
      const info = page.imageinfo?.[0], sourceUrl = commonsUrl(info?.descriptionurl), thumbnail = commonsUrl(info?.thumburl, true);
      const author = cleanText(info?.extmetadata?.Artist?.value, 240), license = cleanText(info?.extmetadata?.LicenseShortName?.value, 100);
      if (!sourceUrl || !thumbnail || seen.has(sourceUrl) || !author || !license
        || !['image/jpeg', 'image/png', 'image/webp'].includes(info?.mime)) return [];
      seen.add(sourceUrl);
      return [{ title: cleanText(page.title, 180).replace(/^File:/, ''),
        alt: cleanText(info?.extmetadata?.ImageDescription?.value, 400) || cleanText(page.title, 180),
        sourceUrl, thumbnail, author, license }];
    }).slice(0, count);
    const outcomes = await Promise.allSettled(selected.map(async ({ thumbnail, ...item }) => {
      const controller = new AbortController(), unlink = linkAbortSignal(controller, signal);
      const timer = setTimeout(() => controller.abort(), this.timeoutMs); timer.unref?.();
      try {
        const response = await this.fetch(thumbnail, { redirect: 'error', signal: controller.signal,
          headers: { Accept: 'image/jpeg,image/png,image/webp', 'User-Agent': 'NexusNXS/0.3 (+https://nexusnxs.com)' } });
        const bytes = await boundedResponseBytes(response, MAX_THUMBNAIL_BYTES, 'Anteprima web', controller.signal);
        const mime = detectImageMime(bytes);
        if (!mime || mime !== String(response.headers.get('content-type') || '').split(';')[0].trim()) throw new Error('Anteprima non valida.');
        return { ...item, url: `data:${mime};base64,${bytes.toString('base64')}` };
      } finally { clearTimeout(timer); unlink(); }
    }));
    signal?.throwIfAborted();
    return { provider: 'wikimedia-commons', images: outcomes.filter(item => item.status === 'fulfilled').map(item => item.value) };
  }

  async searchBrave(query, { limit, signal, timeRange }) {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));
    url.searchParams.set('safesearch', 'moderate');
    url.searchParams.set('text_decorations', 'false');
    url.searchParams.set('spellcheck', 'true');
    if (timeRange) url.searchParams.set('freshness', { day: 'pd', week: 'pw', month: 'pm', year: 'py' }[timeRange]);
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

  async searchSearxng(query, { limit, language, signal, timeRange }) {
    if (timeRange === 'week') throw new Error('SearXNG non supporta il filtro settimanale nativo.');
    const url = new URL('search', `${this.searxngEndpoint.replace(/\/+$/, '')}/`);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', wikipediaLanguage(language));
    url.searchParams.set('safesearch', '1');
    url.searchParams.set('categories', 'general');
    if (timeRange) url.searchParams.set('time_range', timeRange);
    const payload = await this.requestJson(url, { signal });
    return (payload?.results || []).slice(0, limit).map((item, index) => ({
      title: cleanText(item.title, 220),
      url: safePublicUrl(item.url),
      snippet: cleanText(item.content || item.snippet, 1200),
      sourceKind: 'web',
      status: 'external',
      provider: 'searxng',
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

  async enrichStableRelease(results, query, signal) {
    if (!/\blatest stable release official$/iu.test(query)) return results;
    let repository;
    const index = results.findIndex(source => {
      try {
        const url = new URL(source.url);
        const match = /^\/([A-Za-z0-9][A-Za-z0-9_-]{0,99})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})\/releases(?:\/latest)?\/?$/u.exec(url.pathname);
        if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || !match) return false;
        repository = { owner: match[1], name: match[2] }; return true;
      } catch { return false; }
    });
    if (index < 0) return results;
    try {
      // Host e percorso dell'API sono costruiti qui, mai presi da output web.
      // Un solo repository pubblico, senza token o richieste a URL arbitrari.
      const repo = `${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
      const release = await this.requestJson(`https://api.github.com/repos/${repo}/releases/latest`, { signal });
      const sourceUrl = safePublicUrl(release?.html_url), published = Date.parse(release?.published_at);
      const verified = sourceUrl && new URL(sourceUrl);
      if (release?.draft !== false || release?.prerelease !== false || typeof release?.tag_name !== 'string'
        || !release.tag_name.trim() || release.tag_name.length > 128 || !Number.isFinite(published)
        || !verified || verified.hostname !== 'github.com' || verified.port
        || !verified.pathname.toLowerCase().startsWith(`/${repository.owner}/${repository.name}/releases/tag/`.toLowerCase())) return results;
      const enriched = [...results];
      enriched[index] = { ...results[index], url: sourceUrl,
        title: cleanText(`${repository.owner}/${repository.name} — ${release.tag_name}`, 220),
        snippet: cleanText(`Latest stable release of ${repository.owner}/${repository.name}: ${release.tag_name}. Published: ${new Date(published).toISOString()}. ${release.name || ''}`, 1200) };
      return enriched;
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger?.warn?.('Metadati release non disponibili; conservo i risultati della ricerca.');
      return results;
    }
  }

  async search(query, { limit = 4, language = 'it', signal, freshOnly = false, timeRange = '' } = {}) {
    const normalizedQuery = cleanText(query, 500);
    if (!this.enabled || normalizedQuery.length < 2) return { provider: 'off', results: [] };
    const provider = this.activeProvider();
    if (!['', 'day', 'week', 'month', 'year'].includes(timeRange)) throw new Error('Filtro temporale di ricerca non valido.');
    // Solo questi provider applicano un filtro temporale documentato.
    if (timeRange && !['searxng', 'brave'].includes(provider)) throw new Error('Il provider non supporta il filtro temporale richiesto.');
    if (provider === 'unavailable') throw new Error('Il provider di ricerca live non dispone di credenziale e modello server-side completi.');
    if (freshOnly && !['searxng', 'brave', 'openai'].includes(provider)) {
      throw new Error('La ricerca web in tempo reale richiede un provider live configurato sul server.');
    }
    const boundedLimit = Math.max(1, Math.min(8, Number(limit) || 4));
    const key = this.cacheKey(provider, normalizedQuery, wikipediaLanguage(language), boundedLimit, timeRange);
    const cached = this.readCache(key);
    // Un fallback enciclopedico memorizzato non soddisfa una richiesta live:
    // ritentare il provider configurato e conservare l'errore se resta offline.
    if (cached && (!freshOnly || ['searxng', 'brave', 'openai'].includes(cached.provider))) {
      return { provider: cached.provider || provider, cached: true, retrievedAt: cached.retrievedAt, results: cached.results };
    }
    let completedProvider = provider;
    let results;
    try {
      results = provider === 'searxng'
        ? await this.searchSearxng(normalizedQuery, { limit: boundedLimit, language, signal, timeRange })
        : provider === 'brave'
          ? await this.searchBrave(normalizedQuery, { limit: boundedLimit, signal, timeRange })
          : provider === 'openai'
            ? await this.searchOpenAI(normalizedQuery, { limit: boundedLimit, signal })
            : await this.searchWikipedia(normalizedQuery, { limit: boundedLimit, language, signal });
      if (['searxng', 'brave', 'openai'].includes(provider)) this.lastLiveFailureAt = 0;
    } catch (error) {
      if (['searxng', 'brave', 'openai'].includes(provider) && !signal?.aborted) this.lastLiveFailureAt = this.now();
      // In modalita auto il guasto temporaneo di un provider live non deve
      // disattivare tutta la ricerca pubblica. Wikipedia resta un fallback
      // dichiarato; la modalita esplicita conserva invece l'errore.
      if (freshOnly || timeRange || this.provider !== 'auto' || !['searxng', 'brave', 'openai'].includes(provider) || signal?.aborted) throw error;
      this.logger?.warn?.('Provider live non disponibile; uso il fallback Wikipedia.', { error });
      completedProvider = 'wikipedia';
      results = await this.searchWikipedia(normalizedQuery, { limit: boundedLimit, language, signal });
    }
    if (['searxng', 'brave'].includes(completedProvider)) results = await this.enrichStableRelease(results, normalizedQuery, signal);
    const retrievedAt = new Date(this.now()).toISOString();
    results = results.map(source => ({ ...source, retrievedAt, ...(timeRange ? { timeRange } : {}) }));
    this.writeCache(key, results, completedProvider, retrievedAt);
    this.logger?.info?.('Ricerca web completata.', { provider: completedProvider, results: results.length });
    return { provider: completedProvider, cached: false, retrievedAt, results };
  }
}

// #endregion

module.exports = { DEFAULT_OPENAI_RESPONSES_URL, PROVIDERS, WebResearchService, cleanText, safeProviderEndpoint, safePublicUrl, safeSelfHostedEndpoint, wikipediaLanguage };
