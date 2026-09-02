/**
 * @module plugins/local-plugin-registry
 * @description Carica manifest locali senza eseguire codice e applica permessi dichiarativi.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Policy manifest

const ALLOWED_PERMISSIONS = new Set(['workspace:read', 'workspace:write', 'knowledge:read', 'models:invoke', 'audio:output']);
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validateManifest(root, value) {
  if (!value || typeof value !== 'object') throw new Error('Manifest plugin non valido.');
  const id = String(value.id || '');
  if (!/^[a-z0-9][a-z0-9.-]{2,63}$/.test(id)) throw new Error('ID plugin non valido.');
  const lexicalRoot = path.resolve(root);
  const lexicalEntry = path.resolve(lexicalRoot, String(value.entry || ''));
  if (!inside(lexicalRoot, lexicalEntry)) throw new Error('Entry plugin fuori dal proprio spazio.');
  const realRoot = fs.realpathSync(lexicalRoot);
  const realEntry = fs.realpathSync(lexicalEntry);
  if (!inside(realRoot, realEntry) || !fs.statSync(realEntry).isFile()) throw new Error('Entry plugin fuori dal proprio spazio.');
  const permissions = [...new Set(Array.isArray(value.permissions) ? value.permissions.map(String) : [])];
  if (permissions.some((permission) => !ALLOWED_PERMISSIONS.has(permission))) throw new Error('Permesso plugin non riconosciuto.');
  return Object.freeze({ id, name: String(value.name || id).slice(0, 100), version: String(value.version || '0.0.0').slice(0, 32), entry: realEntry, permissions: Object.freeze(permissions) });
}

// #endregion

// #region 02 — Discovery fail-closed

class LocalPluginRegistry {
  constructor(root) { this.root = path.resolve(root); this.plugins = new Map(); }
  discover() {
    this.plugins.clear();
    if (!fs.existsSync(this.root)) return [];
    for (const item of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!item.isDirectory() || item.name.startsWith('.')) continue;
      const directory = path.join(this.root, item.name);
      const manifestPath = path.join(directory, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      const plugin = validateManifest(directory, JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      if (this.plugins.has(plugin.id)) throw new Error(`Plugin duplicato: ${plugin.id}.`);
      this.plugins.set(plugin.id, plugin);
    }
    return this.list();
  }
  list() { return [...this.plugins.values()]; }
  authorize(id, permission) { return this.plugins.get(id)?.permissions.includes(permission) === true; }
}

module.exports = { LocalPluginRegistry, validateManifest, ALLOWED_PERMISSIONS };

// #endregion
