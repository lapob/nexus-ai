#!/usr/bin/env node
/**
 * @module scripts/request-headless-shutdown
 * @description Richiede al server posseduto dal lock di attraversare il normale lifecycle Electron.
 */
const path = require('node:path');
const { requestProcessShutdown } = require('../src/infrastructure/electron/process-lock');

const lockPath = String(process.argv[2] || '').trim();
if (!lockPath) {
  process.stderr.write('Percorso del lock headless mancante.\n');
  process.exitCode = 2;
} else {
  try {
    const result = requestProcessShutdown(path.resolve(lockPath));
    if (!result.requested) {
      process.stderr.write(`Shutdown coordinato non disponibile: ${result.reason}.\n`);
      process.exitCode = 3;
    } else {
      process.stdout.write(`Shutdown coordinato richiesto al processo ${result.pid}.\n`);
    }
  } catch (error) {
    process.stderr.write(`Shutdown coordinato non richiesto: ${error.message}\n`);
    process.exitCode = 1;
  }
}
