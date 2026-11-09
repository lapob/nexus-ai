/**
 * @module application/deep-model
 * @description Modello "Approfondito" scelto esplicitamente dal proprietario.
 *
 * Eval GPU (39 casi agente, 100 casi generali): qwen3.8:27b UD-Q3_K_XL entra
 * interamente in 16 GB di VRAM (~33 token/s, agente 38/39, generale 98%);
 * qwen3:14b resta il modello di ogni giorno (~54 token/s, 38/39, 99%).
 * Il 27B serve solo quando l'utente preme "Approfondito": mai per
 * l'escalation automatica (allegati, domande lunghe), mai per ospiti pubblici.
 */
const { DEEP_MODEL, canonicalModelId } = require('../ai/model-manifest');

/** Budget del turno: a ~33 token/s 8K token richiedono ~4 minuti; il caricamento a freddo ~45 s. */
const DEEP_MODEL_REQUEST = Object.freeze({ maxTokens: 8192, timeoutMs: 900_000, think: false });

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
