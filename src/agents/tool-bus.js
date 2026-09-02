/**
 * @module agents/tool-bus
 * @description Allowlist interna per strumenti tipizzati, consenso e annullamento.
 */
class ToolBus {
  constructor({ audience = 'private' } = {}) {
    this.audience = audience === 'public' ? 'public' : 'private';
    this.tools = new Map();
  }

  register(definition) {
    const id = String(definition?.id || '').trim();
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new Error('Identificatore strumento non valido.');
    if (this.tools.has(id)) throw new Error(`Strumento già registrato: ${id}`);
    if (typeof definition.invoke !== 'function') throw new Error(`Lo strumento ${id} non ha un handler.`);
    const tool = Object.freeze({
      id,
      audience: definition.audience === 'public' ? 'public' : 'private',
      risk: ['low', 'medium', 'high', 'critical'].includes(definition.risk) ? definition.risk : 'medium',
      requiresConsent: definition.requiresConsent === true,
      invoke: definition.invoke
    });
    this.tools.set(id, tool);
    return this;
  }

  capabilities() {
    return [...this.tools.values()]
      .filter((tool) => this.audience === 'private' || tool.audience === 'public')
      .map(({ id, audience, risk, requiresConsent }) => Object.freeze({ id, audience, risk, requiresConsent }));
  }

  async invoke(id, input, context = {}) {
    const tool = this.tools.get(String(id || ''));
    if (!tool || (this.audience === 'public' && tool.audience !== 'public')) {
      throw Object.assign(new Error('Strumento non disponibile.'), { code: 'TOOL_UNAVAILABLE' });
    }
    if (context.signal?.aborted) throw Object.assign(new Error('Operazione annullata.'), { name: 'AbortError', code: 'ABORT_ERR' });
    if (tool.requiresConsent && context.approved !== true) {
      throw Object.assign(new Error('Autorizzazione esplicita richiesta.'), { code: 'TOOL_CONSENT_REQUIRED' });
    }
    return tool.invoke(input, Object.freeze({ ...context, toolId: tool.id }));
  }
}

module.exports = { ToolBus };
