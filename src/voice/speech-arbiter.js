/**
 * @module voice/speech-arbiter
 * @description Garantisce una sola sintesi naturale attiva fra i motori locali.
 */

const LANGUAGE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

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

module.exports = { SpeechArbiter, primaryLanguage };
