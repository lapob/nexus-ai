/** @module shared/artifact-revisions Bounded editable copies; the AI result remains immutable. */
// #region Version contract
export const MAX_ARTIFACT_REVISIONS = 6;
export const MAX_ARTIFACT_CONTENT = 48_000;

export function normalizeArtifactRevisions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id)
      || seen.has(item.id) || typeof item.content !== 'string' || item.content.length > MAX_ARTIFACT_CONTENT
      || !Number.isSafeInteger(item.createdAt) || item.createdAt < 1
      || !Number.isSafeInteger(item.sequence) || item.sequence < 1) return false;
    seen.add(item.id); return true;
  }).slice(-MAX_ARTIFACT_REVISIONS).map(({ id, content, createdAt, sequence }) => ({ id, content, createdAt, sequence }));
}
// #endregion
