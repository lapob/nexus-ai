/**
 * @module ai/model-manifest
 * @description Definisce modelli e profili selezionati in base alle risorse locali.
 */
// #region 01 — Catalogo e profili

const { GIB, classifyHardware } = require('./hardware-profile');

const MODEL_CATALOG = Object.freeze({
  'qwen3:1.7b': Object.freeze({ id: 'qwen3:1.7b', productName: 'NexusNXS Nano', role: 'chat', downloadBytes: 1_400_000_000, minimumTier: 'lite' }),
  'qwen3:4b': Object.freeze({ id: 'qwen3:4b', productName: 'NexusNXS Pulse', role: 'chat', downloadBytes: 2_500_000_000, minimumTier: 'lite' }),
  'qwen3:8b': Object.freeze({ id: 'qwen3:8b', productName: 'NexusNXS Core', role: 'chat', downloadBytes: 5_225_388_164, minimumTier: 'balanced' }),
  'qwen3:14b': Object.freeze({ id: 'qwen3:14b', productName: 'NexusNXS Prime', role: 'chat', downloadBytes: 9_276_198_565, minimumTier: 'performance' }),
  'qwen3:30b': Object.freeze({ id: 'qwen3:30b', productName: 'NexusNXS Ultra', role: 'chat', downloadBytes: 20_400_000_000, minimumTier: 'ultra' }),
  'qwen3-embedding:0.6b': Object.freeze({ id: 'qwen3-embedding:0.6b', productName: 'NexusNXS Memory', role: 'memory', downloadBytes: 638_976_000, minimumTier: 'lite' })
});

const MODEL_PROFILES = Object.freeze({
  lite: Object.freeze({
    id: 'lite',
    label: 'NexusNXS Nano',
    description: 'Risposte immediate sui computer con memoria condivisa o contenuta.',
    // Su Windows con 8 GB il 4B può saturare la memoria e non produrre il
    // primo token per oltre un minuto. Un solo 1.7B rimane invece residente
    // dopo il warm-up e protegge sia la chat sia la reattività dell'interfaccia.
    main: 'qwen3:1.7b',
    fast: 'qwen3:1.7b',
    memory: 'qwen3-embedding:0.6b'
  }),
  essential: Object.freeze({
    id: 'essential',
    label: 'NexusNXS Core',
    description: 'Qualità e velocità adatte alla maggior parte dei computer.',
    main: 'qwen3:8b',
    fast: 'qwen3:4b',
    memory: 'qwen3-embedding:0.6b'
  }),
  complete: Object.freeze({
    id: 'complete',
    label: 'NexusNXS Prime',
    description: 'Ragionamento più profondo per computer con molte risorse.',
    main: 'qwen3:14b',
    fast: 'qwen3:8b',
    memory: 'qwen3-embedding:0.6b'
  }),
  ultra: Object.freeze({
    id: 'ultra',
    label: 'NexusNXS Ultra',
    description: 'Massima qualità verificata per workstation, con Prime mantenuto caldo per eliminare gli scambi di modello.',
    // Il 30B installato è una variante Thinking-only: i benchmark mostrano
    // che espone ragionamento e viola formati brevi. Prime resta il modello
    // principale finché un artefatto Ultra generalista non supera i gate.
    main: 'qwen3:14b',
    // Su una workstation 32 GB RAM / 16 GB VRAM un solo modello può restare
    // residente senza paging. Prime caldo risponde in meno di un secondo nei
    // benchmark e rimuove i 30-40 secondi necessari allo scambio Core/Prime.
    fast: 'qwen3:14b',
    memory: 'qwen3-embedding:0.6b'
  })
});

const TIER_ORDER = Object.freeze({ lite: 0, balanced: 1, performance: 2, ultra: 3 });

// #endregion

// #region 02 — Selezione adattiva

function profileModels(profile) {
  return [...new Set([profile.main, profile.fast, profile.memory])];
}

function canonicalModelId(value) {
  let id = String(value?.id || value?.name || value?.model || value || '').trim().toLowerCase();
  id = id.replace(/^registry\.ollama\.ai\/library\//, '').split('@')[0];
  // Il tag implicito di Ollama è latest. Non viene confuso con tag espliciti
  // come :8b, che identificano artefatti e requisiti hardware differenti.
  if (id && !id.includes(':')) id = `${id}:latest`;
  return id;
}

function publicModelName(value) {
  const id = canonicalModelId(value);
  return MODEL_CATALOG[id]?.productName || String(value?.name || value?.id || value || 'Modello locale');
}

function isUserSelectableModel(value) {
  const id = canonicalModelId(value);
  // Artefatto derivato usato internamente durante gli esperimenti personali:
  // resta disponibile a Ollama per compatibilità, ma non è una scelta distinta
  // e comprensibile nell'interfaccia pubblica.
  return !/^nexus-nexus-personal(?::|$)/i.test(id)
    && id !== 'qwen3:30b';
}

function modelSet(models = []) {
  return new Set(models.map(canonicalModelId).filter(Boolean));
}

function normalizeHardware(input, freeDiskBytes = null) {
  if (typeof input === 'number') {
    return classifyHardware({
      totalMemoryBytes: input,
      cpuThreads: input >= 24 * GIB ? 12 : 6,
      gpuMemoryBytes: 0,
      freeDiskBytes
    });
  }
  return classifyHardware({ ...(input || {}), freeDiskBytes: input?.freeDiskBytes ?? freeDiskBytes });
}

function recommendedProfile(hardware) {
  const profile = normalizeHardware(hardware);
  if (supportsUltra(profile)) return 'ultra';
  return profile.tier === 'performance' ? 'complete' : profile.tier === 'balanced' ? 'essential' : 'lite';
}

function supportsUltra(hardware) {
  const profile = normalizeHardware(hardware);
  return profile.performanceLevel >= 5 && profile.totalMemoryBytes >= 30 * GIB && profile.gpuMemoryBytes >= 14 * GIB;
}

function modelMemoryBudget(hardware) {
  const profile = normalizeHardware(hardware);
  // Riserva almeno 4 GiB a sistema, Electron, indicizzazione e voce. Il resto
  // viene ponderato con RAM e VRAM reali: nessun nome modello o PC specifico.
  const systemReserve = Math.min(8 * GIB, Math.max(4 * GIB, profile.totalMemoryBytes * 0.22));
  const availableRam = Math.max(0, profile.totalMemoryBytes - systemReserve);
  const ramCeiling = availableRam * 0.55;
  const acceleratorCeiling = Math.max(
    profile.totalMemoryBytes * 0.34,
    profile.gpuMemoryBytes * 0.9
  );
  const cpuFactor = profile.cpuThreads <= 4 ? 0.82 : profile.cpuThreads <= 6 ? 0.94 : 1;
  return Math.max(1.25 * GIB, Math.min(ramCeiling, acceleratorCeiling) * cpuFactor);
}

function adaptiveModelSelection(models = [], hardware = {}) {
  const chatModels = models
    .filter((model) => model?.capabilities?.chat !== false)
    .filter((model) => Number(model?.size) > 0)
    .sort((left, right) => Number(left.size) - Number(right.size));
  if (!chatModels.length) {
    const fallback = models.find((model) => model?.capabilities?.chat !== false);
    return { chatModel: fallback?.id || null, fastModel: fallback?.id || null, budgetBytes: modelMemoryBudget(hardware) };
  }
  const budgetBytes = modelMemoryBudget(hardware);
  // Anche i modelli sperimentali restano fuori dall'auto-selezione quando la
  // loro memoria reale supera il budget: un benchmark locale positivo è più
  // importante del solo numero di parametri.
  const fitting = chatModels.filter((model) => Number(model.size) <= budgetBytes);
  const chat = fitting.at(-1) || chatModels[0];
  // Sulle workstation Ultra con un solo slot residente il modello principale
  // misurato resta anche il percorso rapido: il warm benchmark e piu veloce
  // di uno swap tra due pesi differenti e offre qualita uniforme ai client.
  if (supportsUltra(hardware)) {
    return { chatModel: chat.id, fastModel: chat.id, budgetBytes };
  }
  // Il modello rapido occupa circa metà del principale: può restare caldo
  // senza sottrarre tutta la memoria all'interfaccia e alla voce.
  const fastBudget = Math.max(1.25 * GIB, Math.min(budgetBytes, Number(chat.size) * 0.58));
  const fast = chatModels.filter((model) => Number(model.size) <= fastBudget).at(-1)
    || chatModels[0];
  return { chatModel: chat.id, fastModel: fast.id, budgetBytes };
}

function developmentProfile(hardware, installedModels = []) {
  const installed = modelSet(installedModels);
  const completeProfiles = Object.values(MODEL_PROFILES)
    .filter((profile) => profileModels(profile).every((model) => installed.has(canonicalModelId(model))));

  const recommended = recommendedProfile(hardware);
  const compatibleOrder = recommended === 'ultra'
    ? ['ultra', 'complete', 'essential', 'lite']
    : recommended === 'complete'
    ? ['complete', 'essential', 'lite']
    : recommended === 'essential'
      ? ['essential', 'lite']
      : ['lite'];
  return compatibleOrder.find((id) => completeProfiles.some((profile) => profile.id === id))
    || recommended;
}

function modelSuitability(modelId, hardware) {
  const model = MODEL_CATALOG[modelId];
  const profile = normalizeHardware(hardware);
  if (!model) return { compatible: true, recommended: false, reason: '' };
  const effectiveTier = supportsUltra(profile) ? 'ultra' : profile.tier;
  const compatible = TIER_ORDER[effectiveTier] >= TIER_ORDER[model.minimumTier];
  return {
    compatible,
    recommended: profileModels(MODEL_PROFILES[recommendedProfile(profile)]).includes(modelId),
    reason: compatible ? '' : 'Potrebbe risultare lento o saturare la memoria su questo computer.'
  };
}

function provisioningStatus(installedModels, hardware, freeDiskBytes = null) {
  const detected = normalizeHardware(hardware, freeDiskBytes);
  const installed = modelSet(installedModels);
  const recommended = recommendedProfile(detected);
  const profiles = Object.values(MODEL_PROFILES).map((profile) => {
    const required = profileModels(profile);
    const missing = required.filter((id) => !installed.has(canonicalModelId(id)));
    const requiredTier = profile.id === 'ultra' ? 'ultra' : profile.id === 'complete' ? 'performance' : profile.id === 'essential' ? 'balanced' : 'lite';
    const detectedTier = supportsUltra(detected) ? 'ultra' : detected.tier;
    const compatible = TIER_ORDER[detectedTier] >= TIER_ORDER[requiredTier];
    return {
      ...profile,
      required,
      missing,
      compatible,
      complete: missing.length === 0,
      downloadBytes: missing.reduce((sum, id) => sum + MODEL_CATALOG[id].downloadBytes, 0)
    };
  });
  return {
    recommended,
    profiles,
    installed: [...installed],
    hardware: detected,
    totalMemoryBytes: detected.totalMemoryBytes,
    freeDiskBytes: detected.freeDiskBytes
  };
}

// #endregion

// #region 03 — API pubblica

module.exports = {
  adaptiveModelSelection,
  MODEL_CATALOG,
  MODEL_PROFILES,
  canonicalModelId,
  developmentProfile,
  modelMemoryBudget,
  modelSet,
  modelSuitability,
  isUserSelectableModel,
  profileModels,
  provisioningStatus,
  publicModelName,
  recommendedProfile,
  supportsUltra
};

// #endregion
