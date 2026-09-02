/**
 * @module ai/ollama-library
 * @description Individua librerie Ollama esistenti senza scandire i documenti dell'utente.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
    let aliasEntry = null;
    try { aliasEntry = fs.lstatSync(aliasDirectory); } catch {}
    let aliasMatches = false;
    if (aliasEntry) {
      try { aliasMatches = fs.realpathSync(aliasDirectory).toLowerCase() === fs.realpathSync(resolved).toLowerCase(); }
      catch {}
    }
    if (aliasEntry && !aliasMatches) {
      if (!aliasEntry.isSymbolicLink()) return resolved;
      fs.unlinkSync(aliasDirectory);
      aliasEntry = null;
    }
    if (!aliasEntry) fs.symlinkSync(resolved, aliasDirectory, 'junction');
    return fs.realpathSync(aliasDirectory).toLowerCase() === fs.realpathSync(resolved).toLowerCase()
      && hasOllamaLayout(aliasDirectory)
      ? aliasDirectory
      : resolved;
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
