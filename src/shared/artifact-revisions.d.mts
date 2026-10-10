/** @module shared/artifact-revisions Type contract for the common persistence boundary. */
// #region Revision contract
export interface ArtifactRevision { id: string; content: string; createdAt: number; sequence: number }
export const MAX_ARTIFACT_REVISIONS: number;
export const MAX_ARTIFACT_CONTENT: number;
export function normalizeArtifactRevisions(value: unknown): ArtifactRevision[];
// #endregion
