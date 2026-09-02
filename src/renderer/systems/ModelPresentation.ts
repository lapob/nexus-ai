/**
 * @module renderer/systems/ModelPresentation
 * @description Traduce gli identificatori dei runtime in nomi prodotto stabili.
 */
// #region 01 — Nomi pubblici

import type { ModelDescriptor } from '../types/nexus';

const PRODUCT_NAMES: Array<[RegExp, string]> = [
  [/^qwen3:1\.7b$/i, 'NexusNXS Nano'],
  [/^qwen3:4b$/i, 'NexusNXS Pulse'],
  [/^qwen3:8b$/i, 'NexusNXS Core'],
  [/^qwen3:14b$/i, 'NexusNXS Prime'],
  [/^qwen3:30b$/i, 'NexusNXS Ultra'],
  [/^qwen3-embedding:0\.6b$/i, 'NexusNXS Memory']
];

export function modelDisplayName(model?: Pick<ModelDescriptor, 'id' | 'name'> | null): string {
  if (!model) return '';
  const id = String(model.id || '').trim();
  const mapped = PRODUCT_NAMES.find(([pattern]) => pattern.test(id));
  if (mapped) return mapped[1];
  const supplied = String(model.name || '').trim();
  return supplied && supplied.toLowerCase() !== id.toLowerCase() ? supplied : 'NexusNXS Local';
}

/**
 * I provider possono restituire lo stesso runtime più volte (alias, endpoint
 * locale e manifest). Nell'interfaccia il modello deve comparire una sola
 * volta, privilegiando quello selezionato, consigliato e compatibile.
 */
export function uniquePresentedModels(models: ModelDescriptor[], current = ''): ModelDescriptor[] {
  const ordered = [...models].sort((left, right) => Number(right.id === current) - Number(left.id === current)
    || Number(right.recommended) - Number(left.recommended)
    || Number(right.compatible !== false) - Number(left.compatible !== false));
  const visible = new Map<string, ModelDescriptor>();
  for (const model of ordered) {
    const key = modelDisplayName(model).trim().toLocaleLowerCase();
    if (!visible.has(key)) visible.set(key, model);
  }
  return [...visible.values()];
}

// #endregion
