/**
 * @module infrastructure/storage/user-data-migration
 * @description Normalizza il nome della cartella dati preservando il contenuto esistente.
 */
const fs = require('node:fs');
const path = require('node:path');

function normalizeUserDataDirectoryCase(appDataPath, { fileSystem = fs, processId = process.pid } = {}) {
  const root = path.resolve(appDataPath);
  const expectedName = 'NexusNXS';
  const entries = fileSystem.existsSync(root) ? fileSystem.readdirSync(root) : [];
  const existingName = entries.find((name) => name === expectedName)
    || entries.find((name) => name.toLocaleLowerCase('en-US') === 'nexusnxs')
    || entries.find((name) => name.toLocaleLowerCase('en-US') === 'nexus');
  const target = path.join(root, expectedName);
  const intermediate = path.join(root, `.nexusnxs-name-migration-${processId}`);
  if (!existingName && fileSystem.existsSync(intermediate) && !fileSystem.existsSync(target)) {
    fileSystem.renameSync(intermediate, target);
    return target;
  }
  if (!existingName || existingName === expectedName) return target;

  const source = path.join(root, existingName);
  if (fileSystem.existsSync(intermediate)) {
    if (!fileSystem.existsSync(source) && !fileSystem.existsSync(target)) {
      fileSystem.renameSync(intermediate, target);
      return target;
    }
    throw new Error('Migrazione del nome cartella NexusNXS già in corso.');
  }
  // Il passaggio intermedio gestisce sia il vecchio nome Nexus sia eventuali
  // varianti di maiuscole, senza copiare o eliminare i dati dell'utente.
  fileSystem.renameSync(source, intermediate);
  try {
    fileSystem.renameSync(intermediate, target);
  } catch (error) {
    fileSystem.renameSync(intermediate, source);
    throw error;
  }
  return target;
}

module.exports = { normalizeUserDataDirectoryCase };
