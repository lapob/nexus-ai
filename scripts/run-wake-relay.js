#!/usr/bin/env node
/**
 * @module scripts/run-wake-relay
 * @description Avvia o valida il relay Wake-on-LAN privato su un nodo sempre acceso.
 */
const fs = require('node:fs');
const path = require('node:path');
const { WakeRelayServer } = require('../src/remote/wake-relay');

function option(name) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : '';
}

function resolveFrom(base, value, fallback) {
  return path.resolve(base, String(value || fallback));
}

function readConfiguration(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('File di configurazione relay non valido.');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const base = path.dirname(filePath);
  return {
    config: raw,
    statePath: resolveFrom(base, raw.statePath, '../.nexus-data/wake-relay/state.json'),
    auditPath: resolveFrom(base, raw.auditPath, '../.nexus-data/wake-relay/logs/security-audit.jsonl')
  };
}

async function main() {
  const configPath = path.resolve(option('config') || process.env.NEXUS_WAKE_RELAY_CONFIG || path.join('config', 'wake-relay.local.json'));
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configurazione mancante: ${configPath}. Copia config/wake-relay.example.json fuori dal controllo versione e inserisci soltanto valori locali.`);
  }
  const options = readConfiguration(configPath);
  const relay = new WakeRelayServer(options);
  if (process.argv.includes('--check')) {
    const status = relay.status();
    process.stdout.write(`${JSON.stringify({ valid: true, host: status.host, port: status.port, targets: status.targets }, null, 2)}\n`);
    return;
  }
  const status = await relay.start();
  process.stdout.write(`Relay Wake-on-LAN privato in ascolto su ${status.host}:${status.port}.\n`);
  const pairUser = option('pair');
  if (pairUser) {
    const pairing = relay.createPairingCode({ tailnetUser: pairUser });
    process.stdout.write(`Codice monouso per ${pairUser}: ${pairing.code} (scade tra 5 minuti).\n`);
  }
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await relay.stop();
  };
  process.once('SIGINT', () => stop().finally(() => process.exit(0)));
  process.once('SIGTERM', () => stop().finally(() => process.exit(0)));
}

main().catch((error) => {
  process.stderr.write(`Wake relay non avviato: ${error.message}\n`);
  process.exitCode = 1;
});
