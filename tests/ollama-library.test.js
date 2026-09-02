const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { libraryModels, loaderSafeOllamaLibrary, resolveOllamaLibrary, selectOllamaLibrary } = require('../src/ai/ollama-library');

function createLibrary(root, models) {
  const library = path.join(root, '.ollama');
  fs.mkdirSync(path.join(library, 'blobs'), { recursive: true });
  fs.mkdirSync(path.join(library, 'manifests'), { recursive: true });
  for (const model of models) {
    const [name, tag] = model.split(':');
    const manifest = path.join(library, 'manifests', 'registry.ollama.ai', 'library', name, tag);
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, '{}');
  }
  return library;
}

test('legge i modelli dalla struttura manifest standard di Ollama', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-'));
  try {
    const library = createLibrary(temporary, ['qwen3:8b', 'qwen3-embedding:0.6b']);
    assert.deepEqual(libraryModels(library).sort(), ['qwen3-embedding:0.6b', 'qwen3:8b']);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('sceglie tra le unità la libreria con più modelli richiesti', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-drives-'));
  try {
    const first = path.join(temporary, 'C');
    const second = path.join(temporary, 'Z');
    createLibrary(first, ['qwen3:8b']);
    const preferred = createLibrary(second, ['qwen3:8b', 'qwen3:4b']);
    const selected = selectOllamaLibrary(['qwen3:8b', 'qwen3:4b'], {
      homeDirectory: path.join(temporary, 'home'),
      driveRoots: [first, second]
    });
    assert.equal(selected.path, preferred);
    assert.equal(selected.matches, 2);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('risolve la libreria senza dipendere dalla lettera del disco', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-portable-models-'));
  try {
    const home = path.join(temporary, 'home');
    const driveD = path.join(temporary, 'D');
    const driveR = path.join(temporary, 'R');
    createLibrary(driveD, ['qwen3:4b']);
    const preferred = createLibrary(driveR, ['qwen3:4b', 'qwen3-embedding:0.6b']);
    const resolved = resolveOllamaLibrary(['qwen3:4b', 'qwen3-embedding:0.6b'], {
      env: {},
      homeDirectory: home,
      driveRoots: [driveD, driveR]
    });
    assert.equal(resolved.path, preferred);
    assert.equal(resolved.source, 'auto-detected');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('preferisce il volume del progetto alle librerie di altri dischi', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-project-volume-'));
  try {
    const projectVolume = path.join(temporary, 'PortableVolume');
    const systemVolume = path.join(temporary, 'SystemVolume');
    const portable = createLibrary(projectVolume, ['qwen3:4b']);
    createLibrary(systemVolume, ['qwen3:4b', 'qwen3-embedding:0.6b']);
    const resolved = resolveOllamaLibrary(['qwen3:4b', 'qwen3-embedding:0.6b'], {
      env: { OLLAMA_MODELS: path.join(systemVolume, '.ollama') },
      homeDirectory: path.join(temporary, 'home'),
      driveRoots: [systemVolume, projectVolume],
      preferredDriveRoots: [projectVolume]
    });
    assert.equal(resolved.path, portable);
    assert.equal(resolved.source, 'project-volume');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('offre al loader Windows un alias senza parentesi mantenendo i modelli nel workspace', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-loader-models-'));
  try {
    const workspace = path.join(temporary, '[AI]', 'NexusNXS');
    const library = createLibrary(workspace, ['qwen3:8b']);
    const alias = loaderSafeOllamaLibrary(library, {
      projectRoot: path.join(workspace, '.AI'),
      platform: 'win32',
      aliasRoot: temporary,
      aliasName: 'NexusNXS-Models-Test'
    });
    assert.equal(fs.realpathSync(alias), fs.realpathSync(library));
    assert.equal(libraryModels(alias).includes('qwen3:8b'), true);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('usa configurazione esplicita e fallback standard dell’utente', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-model-fallback-'));
  try {
    const explicit = createLibrary(path.join(temporary, 'custom-models'), []);
    const configured = resolveOllamaLibrary([], {
      env: { NEXUS_OLLAMA_MODELS: explicit },
      homeDirectory: path.join(temporary, 'home'),
      driveRoots: []
    });
    assert.equal(configured.path, explicit);
    assert.equal(configured.existing, true);
    assert.equal(resolveOllamaLibrary([], {
      env: {},
      homeDirectory: path.join(temporary, 'home'),
      driveRoots: []
    }).path, path.join(temporary, 'home', '.ollama', 'models'));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
