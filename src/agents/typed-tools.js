/**
 * @module agents/typed-tools
 * @description Strumenti con schema JSON per il function calling nativo, validati prima di ogni invocazione.
 */
const { ToolBus } = require('./tool-bus');

// #region 01 — Validazione JSON Schema (sottoinsieme deterministico)

// Il modello propone argomenti, ma non è un'autorità: ogni chiamata è validata
// contro lo schema dichiarato. Il sottoinsieme supportato è volutamente piccolo
// e senza dipendenze; parole chiave sconosciute rendono lo schema non valido.
const SUPPORTED_KEYWORDS = new Set(['type', 'description', 'properties', 'required', 'additionalProperties', 'enum', 'items',
  'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'pattern', 'default']);
const TYPES = new Set(['object', 'string', 'number', 'integer', 'boolean', 'array']);

function assertSchema(schema, at = 'parameters') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`Schema non valido in ${at}.`);
  for (const key of Object.keys(schema)) if (!SUPPORTED_KEYWORDS.has(key)) throw new Error(`Parola chiave schema non supportata in ${at}: ${key}.`);
  if (!TYPES.has(schema.type)) throw new Error(`Tipo schema non valido in ${at}.`);
  if (schema.pattern !== undefined) new RegExp(schema.pattern, 'u');
  if (schema.type === 'object') {
    for (const [name, child] of Object.entries(schema.properties || {})) assertSchema(child, `${at}.${name}`);
    for (const name of schema.required || []) if (!schema.properties?.[name]) throw new Error(`Campo richiesto non dichiarato in ${at}: ${name}.`);
  }
  if (schema.type === 'array') assertSchema(schema.items || { type: 'string' }, `${at}[]`);
}

function typeMatches(type, value) {
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

/** Restituisce l'elenco degli errori; un array vuoto significa argomenti validi. */
function validateAgainstSchema(schema, value, at = '$') {
  const errors = [];
  if (!typeMatches(schema.type, value)) return [`${at}: atteso ${schema.type}`];
  if (schema.enum && !schema.enum.some((item) => item === value)) errors.push(`${at}: valore non consentito`);
  if (schema.type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: troppo corto`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: troppo lungo`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: formato non valido`);
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: sotto il minimo ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: sopra il massimo ${schema.maximum}`);
  }
  if (schema.type === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: troppi pochi elementi`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: troppi elementi`);
    value.forEach((item, index) => errors.push(...validateAgainstSchema(schema.items || { type: 'string' }, item, `${at}[${index}]`)));
  }
  if (schema.type === 'object') {
    const properties = schema.properties || {};
    for (const name of schema.required || []) if (value[name] === undefined) errors.push(`${at}.${name}: obbligatorio`);
    for (const [name, child] of Object.entries(value)) {
      if (properties[name]) errors.push(...validateAgainstSchema(properties[name], child, `${at}.${name}`));
      else if (schema.additionalProperties !== true) errors.push(`${at}.${name}: campo non previsto`);
    }
  }
  return errors.slice(0, 12);
}

// #endregion

// #region 02 — Registro strumenti tipizzati

/**
 * Ogni strumento dichiara nome, descrizione per il modello, schema, rischio e
 * consenso. Audience, consenso e annullamento restano applicati dal ToolBus.
 */
class TypedToolRegistry {
  constructor({ audience = 'private' } = {}) {
    this.bus = new ToolBus({ audience });
    this.definitions = new Map();
  }

  register(definition) {
    const name = String(definition?.name || '').trim();
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(name)) throw new Error('Nome strumento non valido.');
    const description = String(definition.description || '').trim();
    if (!description || description.length > 1024) throw new Error(`Descrizione mancante o troppo lunga per ${name}.`);
    const parameters = definition.parameters || { type: 'object', properties: {} };
    if (parameters.type !== 'object') throw new Error(`I parametri di ${name} devono essere un oggetto.`);
    assertSchema(parameters);
    const timeoutMs = Number(definition.timeoutMs ?? 20_000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) throw new Error(`Timeout non valido per ${name}.`);
    this.bus.register({ id: name, audience: definition.audience, risk: definition.risk, requiresConsent: definition.requiresConsent, invoke: definition.invoke });
    const capability = this.bus.capabilities().find((tool) => tool.id === name)
      || { id: name, audience: definition.audience === 'public' ? 'public' : 'private', risk: definition.risk || 'medium', requiresConsent: definition.requiresConsent === true };
    this.definitions.set(name, Object.freeze({ name, description, parameters, timeoutMs, risk: capability.risk, requiresConsent: capability.requiresConsent,
      summarize: typeof definition.summarize === 'function' ? definition.summarize : null }));
    return this;
  }

  /** Strumenti visibili per questa audience. */
  list() {
    const visible = new Set(this.bus.capabilities().map((tool) => tool.id));
    return [...this.definitions.values()].filter((tool) => visible.has(tool.name));
  }

  get(name) { return this.list().find((tool) => tool.name === name) || null; }

  /** Formato function-calling consumato da validateChatRequest e dai provider. */
  definitionsForModel() {
    return this.list().map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
  }

  validate(name, args) {
    const tool = this.get(name);
    if (!tool) return { ok: false, code: 'TOOL_UNAVAILABLE', errors: [`Strumento sconosciuto: ${name}`] };
    const errors = validateAgainstSchema(tool.parameters, args ?? {});
    return errors.length ? { ok: false, code: 'TOOL_ARGUMENTS_INVALID', errors } : { ok: true, tool };
  }

  /** Invoca con validazione, consenso del ToolBus e timeout proprio dello strumento. */
  async invoke(name, args, context = {}) {
    const check = this.validate(name, args);
    if (!check.ok) throw Object.assign(new Error(check.errors.join('; ')), { code: check.code });
    const timeout = AbortSignal.timeout(check.tool.timeoutMs);
    const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
    const pending = this.bus.invoke(name, args, { ...context, signal });
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(Object.assign(new Error(timeout.aborted && !context.signal?.aborted ? 'Strumento scaduto.' : 'Operazione annullata.'),
        { code: timeout.aborted && !context.signal?.aborted ? 'TOOL_TIMEOUT' : 'ABORT_ERR' }));
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([pending, aborted]); }
    finally { signal.removeEventListener('abort', onAbort); pending.catch(() => {}); }
  }
}

// #endregion

module.exports = { TypedToolRegistry, validateAgainstSchema, assertSchema };
