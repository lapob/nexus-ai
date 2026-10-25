/** @module plugins/local-integrations Revocable owner-only MCP and n8n connections. */
const fs = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
const { normalizeArtifacts } = require('../application/artifact-stream');
const LIMIT = 256 * 1024;
function reject(code = 'INTEGRATION_UNAVAILABLE') {
  throw Object.assign(new Error('Integrazione locale non disponibile o autorizzazione scaduta.'), { code });
}

// #region Trusted local configuration, never supplied by a model or HTTP caller
function connectionsFromFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 65536) reject('INTEGRATION_CONFIG_INVALID');
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(value.connections) || value.connections.length > 16) reject('INTEGRATION_CONFIG_INVALID');
  return value.connections;
}
function disableConnectionInFile(filePath, id) {
  const connections = connectionsFromFile(filePath).map(item => item.id === id ? { ...item, enabled: false } : item);
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(descriptor, JSON.stringify({ connections }, null, 2) + '\n'); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, filePath);
  } finally { try { fs.unlinkSync(temporary); } catch {} }
}
function connection(value) {
  if (!value || !/^[a-z][a-z0-9-]{1,40}$/.test(value.id || '') || !['mcp', 'n8n'].includes(value.type)) reject('INTEGRATION_CONFIG_INVALID');
  const url = new URL(value.url);
  // No DNS resolution, public hosts, Tailscale routing, credentials or URL tokens.
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash) reject('INTEGRATION_CONFIG_INVALID');
  if (!/^NEXUS_INTEGRATION_[A-Z0-9_]{1,64}$/.test(value.authEnv || '')) reject('INTEGRATION_CONFIG_INVALID');
  if (!Array.isArray(value.tools) || !value.tools.length || value.tools.length > 32
    || value.tools.some(name => !/^[a-zA-Z0-9_.-]{1,64}$/.test(name)) || new Set(value.tools).size !== value.tools.length
    || (value.type === 'n8n' && (value.tools.length !== 1 || value.tools[0] !== 'trigger'))) reject('INTEGRATION_CONFIG_INVALID');
  return Object.freeze({ id: value.id, type: value.type, url: url.href, authEnv: value.authEnv,
    tools: Object.freeze([...value.tools]), enabled: value.enabled === true });
}
async function boundedResponse(response, signal) {
  if (!response.ok) { await response.body?.cancel(); reject('INTEGRATION_HTTP_FAILED'); }
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body || []) {
    signal.throwIfAborted(); bytes += chunk.byteLength;
    if (bytes > LIMIT) reject('INTEGRATION_OUTPUT_LIMIT');
    chunks.push(Buffer.from(chunk));
  }
  return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
}
// #endregion

// #region ActionRuntime owns approval, tickets, receipts and workflow recovery
class LocalIntegrations {
  #revoked = new Set(); #active = new Map(); #disposed = false;
  constructor({ load = () => [], persistRevocation = () => {}, env = process.env, request = fetch, sdk = () => require('@modelcontextprotocol/client') } = {}) {
    this.load = load; this.env = env; this.request = request; this.sdk = sdk;
    this.persistRevocation = persistRevocation;
  }
  #connections() {
    if (this.#disposed) return [];
    const values = this.load();
    if (!Array.isArray(values) || values.length > 16) reject('INTEGRATION_CONFIG_INVALID');
    const all = values.map(connection);
    if (new Set(all.map(item => item.id)).size !== all.length) reject('INTEGRATION_CONFIG_INVALID');
    return all.filter(item => item.enabled && !this.#revoked.has(item.id));
  }
  capabilities() { return this.#connections().map(({ id, type, tools, authEnv }) => {
    const token = this.env[authEnv];
    return { id, type, tools, ready: typeof token === 'string' && token.length >= 32 && token.length <= 2048 && !/[\r\n]/.test(token), approval: 'every-action', localOnly: true };
  }); }
  validate(input = {}) {
    const config = this.#connections().find(item => item.id === input.connection);
    if (!config || !config.tools.includes(input.tool)) reject();
    const token = this.env[config.authEnv];
    if (typeof token !== 'string' || token.length < 32 || token.length > 2048 || /[\r\n]/.test(token)) reject('INTEGRATION_AUTH_MISSING');
    const serialized = JSON.stringify(input.input ?? {});
    if (!serialized || Buffer.byteLength(serialized) > 16384) reject('INTEGRATION_INPUT_LIMIT');
    const payload = JSON.parse(serialized);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) reject('INTEGRATION_INPUT_INVALID');
    const revision = createHash('sha256').update(JSON.stringify(config)).update(token).digest('hex');
    if (input.revision && input.revision !== revision) reject('INTEGRATION_AUTH_CHANGED');
    return { connection: config.id, tool: input.tool, input: payload, revision };
  }
  async invoke(input, { signal } = {}) {
    const args = this.validate(input), config = this.#connections().find(item => item.id === args.connection);
    if (this.#active.has(config.id)) reject('INTEGRATION_BUSY');
    const controller = new AbortController(); this.#active.set(config.id, controller);
    const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
    let client;
    const guardedFetch = async (target, options = {}) => {
      combined.throwIfAborted(); this.validate(args);
      if (new URL(target instanceof Request ? target.url : String(target)).href !== config.url) reject('INTEGRATION_DESTINATION_DENIED');
      if (!['POST', 'DELETE'].includes(String(options.method || 'GET').toUpperCase())) reject('INTEGRATION_METHOD_DENIED');
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${this.env[config.authEnv]}`);
      const response = await this.request(config.url, { ...options, headers, redirect: 'error',
        signal: AbortSignal.any([combined, ...(options.signal ? [options.signal] : [])]) });
      if ([202, 204].includes(response.status)) { await response.body?.cancel(); return new Response(null, { status: response.status, headers: response.headers }); }
      return boundedResponse(response, combined);
    };
    try {
      combined.throwIfAborted();
      if (config.type === 'n8n') {
        await guardedFetch(config.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args.input) });
        combined.throwIfAborted(); this.validate(args);
        return { message: 'Richiesta accettata da n8n. Verifica l’esito nel workflow.', verification: 'accepted-unverified', canUndo: false };
      }
      const { Client, StreamableHTTPClientTransport } = this.sdk();
      client = new Client({ name: 'NexusNXS', version: '1' }, { capabilities: {} });
      const transport = new StreamableHTTPClientTransport(new URL(config.url), { fetch: guardedFetch, requestInit: { redirect: 'error' } });
      await client.connect(transport, { signal: combined });
      // No sampling, roots, elicitation, instructions or downloaded code become authority.
      const result = await client.callTool({ name: args.tool, arguments: args.input }, { signal: combined, timeout: 25000 });
      combined.throwIfAborted(); this.validate(args);
      if (result.isError) reject('INTEGRATION_TOOL_FAILED');
      const text = (result.content || []).filter(item => item.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n').slice(0, 48000);
      return { message: 'Lo strumento ha restituito un risultato. Gli effetti esterni richiedono verifica.', verification: 'tool-returned-unverified', canUndo: false,
        artifacts: normalizeArtifacts([{ kind: 'document', id: `integration-${config.id}`, title: args.tool, content: text }]) };
    } catch (error) {
      if (combined.aborted) throw Object.assign(new Error('Richiesta locale annullata; eventuali effetti esterni vanno verificati.'), { code: 'ABORT_ERR', name: 'AbortError' });
      reject(error?.code?.startsWith('INTEGRATION_') ? error.code : 'INTEGRATION_FAILED');
    } finally {
      controller.abort(); await client?.close().catch(() => {});
      if (this.#active.get(config.id) === controller) this.#active.delete(config.id);
    }
  }
  revoke(id) {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(id || '')) reject('INTEGRATION_CONFIG_INVALID');
    this.#revoked.add(id); this.#active.get(id)?.abort(); this.persistRevocation(id);
  }
  shutdown() { this.#disposed = true; for (const controller of this.#active.values()) controller.abort(); }
}
module.exports = { LocalIntegrations, connectionsFromFile, disableConnectionInFile };
// #endregion
