/**
 * @module ai/ollama-library
 * @description Individua librerie Ollama esistenti senza scandire i documenti dell'utente.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { canonicalModelId, modelSet } = require('./model-manifest');

// #region 01 — Posizioni candidate

function windowsDriveRoots() {
  if (process.platform !== 'win32') return ['/'];
  const roots = [];
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(root)) roots.push(root);
    } catch {}
  }
  return roots;
}

function hasOllamaLayout(candidate) {
  try {
    return fs.existsSync(path.join(candidate, 'manifests'))
      && fs.existsSync(path.join(candidate, 'blobs'));
  } catch { return false; }
}

// Solo metadati piccoli: i pesi rimangono nella libreria originale. Il root
// del catalogo deve essere una directory reale: Ollama recente verifica i
// manifest con EvalSymlinks e non legge alcuni root Windows via junction.
function catalogPart(value) { return value && value !== '.' && value !== '..' && !/[\\/:\0]/u.test(value); }
function catalogKey(relative) {
  const parts = relative.split('/');
  if (parts.length !== 5 || !['manifests', 'manifests-v2'].includes(parts[0]) || !parts.every(catalogPart)) throw new Error('Catalogo modelli non valido.');
  if (parts[1] === 'ollama.com') parts[1] = 'registry.ollama.ai';
  return parts.slice(1).join('/');
}
function atomicCatalogFile(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, target); }
  finally { fs.rmSync(temporary, { force: true }); }
}
function catalogDestination(root, relative, create = false) {
  catalogKey(relative);
  const parts = relative.split('/'); let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = path.join(parent, part);
    let entry; try { entry = fs.lstatSync(parent); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) throw new Error('Directory catalogo non valida.');
    if (!entry && create) fs.mkdirSync(parent);
  }
  return path.join(parent, parts.at(-1));
}
function collectCatalog(library) {
  const entries = new Map(), blobRoot = fs.realpathSync(path.join(library, 'blobs'));
  const visit = (directory, parts) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!catalogPart(item.name)) throw new Error('Nome manifest non valido.');
      const source = path.join(directory, item.name), relative = [...parts, item.name];
      if (relative.length < 5) {
        if (!item.isDirectory() || item.isSymbolicLink()) throw new Error('Directory manifest non valida.');
        visit(source, relative); continue;
      }
      if (relative.length !== 5 || item.isDirectory()) throw new Error('Profondità manifest non valida.');
      let digest;
      if (item.isSymbolicLink()) {
        const target = fs.realpathSync(source);
        if (path.dirname(target) !== blobRoot || !/^sha256-[a-f0-9]{64}$/u.test(path.basename(target))) throw new Error('Link manifest non valido.');
        digest = path.basename(target).slice(7);
      }
      const info = fs.statSync(source);
      if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Manifest troppo grande.');
      const bytes = fs.readFileSync(source), sha256 = createHash('sha256').update(bytes).digest('hex');
      JSON.parse(bytes.toString('utf8'));
      if (digest && digest !== sha256) throw new Error('Integrità manifest non valida.');
      entries.set(relative.join('/'), { bytes, sha256 });
    }
  };
  for (const kind of ['manifests', 'manifests-v2']) if (fs.existsSync(path.join(library, kind))) visit(path.join(library, kind), [kind]);
  return entries;
}
function materializeCatalog(library, aliasDirectory) {
  const entries = collectCatalog(library), marker = path.join(aliasDirectory, '.nexus-model-catalog.json');
  const sourceRelative = path.relative(path.parse(library).root, library).toLowerCase();
  let previous = { schemaVersion: 1, sourceRelative, files: {} }, item;
  try { item = fs.lstatSync(aliasDirectory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (item?.isSymbolicLink()) {
    if (fs.realpathSync(aliasDirectory).toLowerCase() !== fs.realpathSync(library).toLowerCase()) throw new Error('Alias modelli non appartenente alla libreria.');
    fs.unlinkSync(aliasDirectory); item = null;
  } else if (item) {
    if (!item.isDirectory() || fs.lstatSync(marker).isSymbolicLink() || fs.statSync(marker).size > 1024 * 1024) throw new Error('Catalogo non appartenente a NexusNXS.');
    previous = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (previous.schemaVersion !== 1 || previous.sourceRelative !== sourceRelative || !previous.files || typeof previous.files !== 'object' || Array.isArray(previous.files)) throw new Error('Catalogo di un’altra libreria.');
    for (const [relative, digest] of Object.entries(previous.files)) {
      catalogKey(relative); if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error('Indice catalogo non valido.');
    }
  }
  if (!item) { fs.mkdirSync(aliasDirectory, { recursive: true }); atomicCatalogFile(marker, JSON.stringify(previous)); }
  const blobLink = path.join(aliasDirectory, 'blobs'), target = fs.realpathSync(path.join(library, 'blobs'));
  let link; try { link = fs.lstatSync(blobLink); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let previousTarget = '';
  if (link) try { previousTarget = fs.realpathSync(blobLink); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (link && previousTarget.toLowerCase() !== target.toLowerCase()) {
    if (!link.isSymbolicLink()) throw new Error('Directory pesi non appartenente al catalogo.');
    fs.unlinkSync(blobLink); link = null;
  }
  if (!link) fs.symlinkSync(target, blobLink, 'junction');
  const files = Object.fromEntries([...entries].map(([relative, entry]) => [relative, entry.sha256]));
  const changed = new Set([...new Set([...Object.keys(previous.files), ...Object.keys(files)])]
    .filter(relative => previous.files[relative] !== files[relative]).map(catalogKey));
  for (const key of changed) {
    const parts = key.split('/'), hosts = parts[0] === 'registry.ollama.ai' ? ['registry.ollama.ai', 'ollama.com'] : [parts[0]];
    for (const kind of ['manifests', 'manifests-v2']) for (const host of hosts) {
      const destination = catalogDestination(aliasDirectory, [kind, host, ...parts.slice(1)].join('/'));
      // Solo file nominati nell'indice posseduto; nessuna cancellazione ricorsiva.
      if (fs.existsSync(destination)) { if (fs.lstatSync(destination).isDirectory()) throw new Error('Destinazione manifest non valida.'); fs.unlinkSync(destination); }
    }
  }
  for (const [relative, entry] of entries) {
    const destination = catalogDestination(aliasDirectory, relative, true);
    if (changed.has(catalogKey(relative)) || !fs.existsSync(destination)) atomicCatalogFile(destination, entry.bytes);
  }
  for (const kind of ['manifests', 'manifests-v2']) fs.mkdirSync(path.join(aliasDirectory, kind), { recursive: true });
  if (JSON.stringify(previous.files) !== JSON.stringify(files)) atomicCatalogFile(marker, JSON.stringify({ schemaVersion: 1, sourceRelative, files }));
  return aliasDirectory;
}

function loaderSafeOllamaLibrary(libraryPath, {
  projectRoot,
  platform = process.platform,
  aliasName = 'NexusNXS-Models',
  aliasRoot
} = {}) {
  const resolved = path.resolve(String(libraryPath || ''));
  if (platform !== 'win32' || !/[\[\]]/.test(resolved) || !projectRoot || !hasOllamaLayout(resolved)) return resolved;
  const aliasDirectory = path.join(aliasRoot ? path.resolve(aliasRoot) : path.parse(path.resolve(projectRoot)).root, aliasName);
  try {
    return materializeCatalog(resolved, aliasDirectory);
  } catch {
    return resolved;
  }
}

function candidateLibraries({ homeDirectory = os.homedir(), driveRoots = windowsDriveRoots(), includeHome = true } = {}) {
  const candidates = new Set();
  if (includeHome) {
    candidates.add(path.join(homeDirectory, '.ollama', 'models'));
    candidates.add(path.join(homeDirectory, '.ollama'));
  }
  for (const root of driveRoots) {
    candidates.add(path.join(root, '.ollama'));
    candidates.add(path.join(root, '.ollama', 'models'));
  }
  return [...candidates].filter(hasOllamaLayout);
}

/**
 * Risolve la directory modelli senza conoscere la lettera dell'unità.
 * Le variabili esplicite hanno precedenza; in loro assenza viene riusata la
 * libreria valida che contiene più modelli richiesti. Il fallback coincide con
 * il layout standard di Ollama e può quindi essere creato su qualsiasi PC.
 */
function resolveOllamaLibrary(requiredModels = [], {
  env = process.env,
  homeDirectory = os.homedir(),
  driveRoots = windowsDriveRoots(),
  preferredDriveRoots = []
} = {}) {
  const nexusExplicit = String(env.NEXUS_OLLAMA_MODELS || '').trim();
  if (nexusExplicit) {
    const explicitPath = path.resolve(nexusExplicit);
    return { path: explicitPath, source: 'environment', existing: hasOllamaLayout(explicitPath) };
  }

  // In sviluppo, il volume che contiene il repository è autoritativo. Se il
  // sistema gli assegna una lettera diversa, il percorso viene ricalcolato dal
  // repository corrente invece di riusare per errore una libreria su C:.
  const preferred = preferredDriveRoots.length
    ? selectOllamaLibrary(requiredModels, { homeDirectory, driveRoots: preferredDriveRoots, includeHome: false })
    : null;
  if (preferred) return { ...preferred, source: 'project-volume', existing: true };

  // OLLAMA_MODELS è condivisa con l'installazione globale e può conservare la
  // vecchia lettera dell'SSD. Viene rispettata solo dopo il volume del progetto.
  const ollamaExplicit = String(env.OLLAMA_MODELS || '').trim();
  if (ollamaExplicit) {
    const explicitPath = path.resolve(ollamaExplicit);
    if (hasOllamaLayout(explicitPath)) {
      return { path: explicitPath, source: 'ollama-environment', existing: true };
    }
  }

  const selected = selectOllamaLibrary(requiredModels, { homeDirectory, driveRoots });
  if (selected) return { ...selected, source: 'auto-detected', existing: true };

  return {
    path: path.join(path.resolve(homeDirectory), '.ollama', 'models'),
    models: [],
    matches: 0,
    complete: false,
    source: 'user-default',
    existing: false
  };
}

// #endregion

// #region 02 — Lettura manifest e selezione

function libraryModels(libraryPath) {
  const manifests = path.join(libraryPath, 'manifests');
  const models = new Set();
  const visit = (directory) => {
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(manifests, absolute).split(path.sep);
        if (relative.length >= 4) {
          const name = relative.slice(2, -1).join('/');
          const tag = relative.at(-1);
          models.add(`${name}:${tag}`);
        }
      }
    }
  };
  visit(manifests);
  return [...models];
}

function selectOllamaLibrary(requiredModels = [], options = {}) {
  const required = modelSet(requiredModels);
  const libraries = candidateLibraries(options).map((libraryPath) => {
    const models = libraryModels(libraryPath);
    return {
      path: libraryPath,
      models,
      matches: models.filter((model) => required.has(canonicalModelId(model))).length,
      complete: required.size > 0 && models.filter((model) => required.has(canonicalModelId(model))).length === required.size
    };
  });
  return libraries.sort((left, right) =>
    Number(right.complete) - Number(left.complete)
    || right.matches - left.matches
    || right.models.length - left.models.length
    || left.path.localeCompare(right.path)
  )[0] || null;
}

module.exports = {
  candidateLibraries,
  hasOllamaLayout,
  loaderSafeOllamaLibrary,
  libraryModels,
  resolveOllamaLibrary,
  selectOllamaLibrary,
  windowsDriveRoots
};

// #endregion
