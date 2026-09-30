/**
 * @module voice/speech-arbiter
 * @description Garantisce una sola sintesi naturale attiva fra i motori locali.
 */

const LANGUAGE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
// #region 01 — Local conversation ownership

function primaryLanguage(value = 'it') {
  const language = String(value || 'it').trim();
  if (!LANGUAGE_PATTERN.test(language)) throw new Error('Lingua della voce non valida.');
  return language.toLowerCase().split('-')[0];
}

class SpeechArbiter {
  constructor({ neural, expressive = null } = {}) {
    this.engines = { neural, expressive };
    this.generation = 0;
  }

  supports(engine, language) {
    const service = this.engines[engine];
    const capabilities = service?.capabilities?.() || {};
    return capabilities.available === true
      && (capabilities.languages || []).map((value) => String(value).toLowerCase()).includes(language);
  }

  select(preferred, language) {
    if (preferred === 'expressive' && this.supports('expressive', language)) return this.engines.expressive;
    if (this.supports('neural', language)) return this.engines.neural;
    if (this.supports('expressive', language)) return this.engines.expressive;
    throw new Error(`Voce naturale non disponibile per la lingua ${language}.`);
  }

  stop() {
    this.invalidate();
    const neuralStopped = this.engines.neural?.stop?.() || false;
    const expressiveStopped = this.engines.expressive?.stop?.() || false;
    return neuralStopped || expressiveStopped;
  }

  invalidate() { this.generation += 1; }

  async synthesize({ engine = 'neural', language = 'it', ...options } = {}) {
    const normalizedLanguage = primaryLanguage(language);
    const generation = this.generation + 1;
    this.stop();
    // stop() incrementa la generazione; questa richiesta ne diventa l'unica
    // proprietaria finché un nuovo speak/stop non la sostituisce.
    this.generation = generation;
    const service = this.select(engine, normalizedLanguage);
    const result = await service.synthesize({ ...options, language: normalizedLanguage });
    if (this.generation !== generation) {
      const error = new Error('Sintesi vocale sostituita da una richiesta più recente.');
      error.code = 'VOICE_CANCELLED';
      throw error;
    }
    return result;
  }
}

// #endregion
// #region 02 — Bounded remote admission on dedicated engines
class RemoteSpeechQueue {
  constructor({ neural, expressive = null, capacity = 4, timeoutMs = 60_000 } = {}) {
    this.arbiter = new SpeechArbiter({ neural, expressive });
    this.capacity = capacity;
    this.timeoutMs = timeoutMs;
    this.queue = [];
    this.active = null;
    this.disposed = false;
  }

  synthesize({ owner, signal, ...options }) {
    if (this.disposed) return Promise.reject(Object.assign(new Error('Voce remota terminata.'), { code: 'VOICE_STOPPED' }));
    if (signal?.aborted) return Promise.reject(this.cancelled());
    if (!owner || this.queue.length + Number(Boolean(this.active)) >= this.capacity
      || this.active?.owner === owner || this.queue.some((job) => job.owner === owner)) {
      return Promise.reject(Object.assign(new Error('Voce occupata. Riprova tra poco.'), { code: 'VOICE_BUSY' }));
    }
    return new Promise((resolve, reject) => {
      const job = { owner, options, signal, resolve, reject, settled: false, cancelled: false };
      job.onAbort = () => this.cancel(job);
      job.timer = setTimeout(job.onAbort, this.timeoutMs);
      job.timer.unref?.();
      signal?.addEventListener('abort', job.onAbort, { once: true });
      this.queue.push(job);
      if (signal?.aborted) this.cancel(job);
      this.pump();
    });
  }

  cancelled() { return Object.assign(new Error('Sintesi vocale annullata.'), { name: 'AbortError', code: 'VOICE_CANCELLED' }); }

  settle(job, error, result) {
    if (job.settled) return;
    job.settled = true;
    clearTimeout(job.timer);
    job.signal?.removeEventListener('abort', job.onAbort);
    if (error) job.reject(error);
    else job.resolve(result);
  }

  cancel(job) {
    if (job.settled) return;
    job.cancelled = true;
    this.queue = this.queue.filter((entry) => entry !== job);
    // Only the owner of the active slot can stop these dedicated engines.
    if (this.active === job) this.arbiter.stop();
    this.settle(job, this.cancelled());
  }

  pump() {
    if (this.disposed || this.active || !this.queue.length) return;
    const job = this.queue.shift();
    this.active = job;
    this.run(job).then(
      (result) => this.settle(job, job.cancelled ? this.cancelled() : null, result),
      (error) => this.settle(job, error)
    ).finally(() => {
      this.active = null;
      this.pump();
    });
  }

  async run(job) {
    const language = primaryLanguage(job.options.language);
    const service = this.arbiter.select('neural', language);
    try {
      return await service.synthesize({ ...job.options, language });
    } catch (error) {
      if (job.cancelled || this.disposed) throw this.cancelled();
      const fallback = this.arbiter.engines.expressive;
      if (service === fallback || !this.arbiter.supports('expressive', language)) throw error;
      return fallback.synthesize({ ...job.options, language });
    }
  }

  shutdown() {
    if (this.disposed) return;
    this.disposed = true;
    for (const job of [...this.queue]) this.cancel(job);
    if (this.active) this.cancel(this.active);
    this.arbiter.engines.neural?.shutdown?.();
    this.arbiter.engines.expressive?.shutdown?.();
  }
}
// #endregion
module.exports = { SpeechArbiter, RemoteSpeechQueue, primaryLanguage };
