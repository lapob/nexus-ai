/** @module shared/local-workflow-recipes Finite local document recipes; never an executor. */
// #region Document copy recipe
function documentPath(value) {
  if (typeof value !== 'string' || value.length > 1024 || /[:\0]/.test(value)) throw new TypeError('Percorso documento non valido.');
  const normalized = value.trim().replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some(part => !part || part === '.' || part === '..')
    || !/\.(?:txt|md|json|csv)$/i.test(normalized)) throw new TypeError('Usa un documento TXT, MD, JSON o CSV nello spazio di lavoro.');
  return normalized;
}

export function documentCopyRecipe(source, destination) {
  const from = documentPath(source); const to = documentPath(destination);
  if (from.toLowerCase() === to.toLowerCase()) throw new TypeError('Scegli una destinazione diversa.');
  return { summary: 'Copia e consulta un documento locale', steps: [
    { id: 'copy-document', tool: 'copy_path', arguments: { source: from, destination: to, documentOnly: true } },
    { id: 'read-copy', tool: 'read_file', arguments: { path: to } }
  ] };
}
// #endregion
