/**
 * @module application/deep-model
 * @description Modello "Approfondito" scelto esplicitamente dal proprietario.
 *
 * Eval agente GPU dell'8/11/2026 (39 casi): qwen3.8:27b 100% ma ~10 token/s
 * perché non entra interamente in 16 GB di VRAM; qwen3:14b 97.4% a ~54 token/s.
 * Il 27B serve quindi solo quando l'utente preme "Approfondito": mai per
 * l'escalation automatica (allegati, domande lunghe), mai per ospiti pubblici.
 */
const { DEEP_MODEL, canonicalModelId } = require('../ai/model-manifest');

/** Budget del turno: a ~10 token/s 4K token richiedono ~7 minuti. */
const DEEP_MODEL_REQUEST = Object.freeze({ maxTokens: 4096, timeoutMs: 900_000, think: false });

function explicitDeepModel({ requestedMode, publicGuest = false, distributionMode = '', installedModels = [], preferred = DEEP_MODEL } = {}) {
  if (requestedMode !== 'deep' || publicGuest || distributionMode === 'public' || !preferred) return null;
  const wanted = canonicalModelId(preferred);
  for (const model of Array.isArray(installedModels) ? installedModels : []) {
    const id = String(model?.id || model?.name || model?.model || model || '');
    if (id && canonicalModelId(id) === wanted && model?.capabilities?.chat !== false) return id;
  }
  return null;
}

/** Elenca i modelli solo per una richiesta "Approfondito" ammessa; un errore ripiega sul percorso ordinario. */
async function resolveDeepModel(options = {}, listModels = async () => []) {
  if (!explicitDeepModel({ ...options, installedModels: [options.preferred || DEEP_MODEL] })) return null;
  try { return explicitDeepModel({ ...options, installedModels: await listModels() }); }
  catch { return null; }
}

module.exports = { explicitDeepModel, resolveDeepModel, DEEP_MODEL_REQUEST };
