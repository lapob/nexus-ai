/** @module shared/local-workflow-recipes Common recipe type contract. */
// #region Recipe contract
export function documentCopyRecipe(source: string, destination: string): {
  summary: string; steps: Array<{ id: string; tool: string; arguments: Record<string, string | boolean> }>
};
// #endregion
