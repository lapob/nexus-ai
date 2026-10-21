/**
 * @module scripts/inspect-native-runtime
 * @description Inventario PE offline in sola lettura, senza esecuzione né ammissione automatica.
 */
const { inspectNativeRuntime } = require('../src/ai/native-runtime-inventory');

// #region 01 — CLI diagnostica

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0]) throw new Error('Uso: node scripts/inspect-native-runtime.js <percorso-assoluto-exe>');
  const inventory = await inspectNativeRuntime(args[0], { signal: AbortSignal.timeout(60000) });
  console.log(JSON.stringify({ ...inventory, distributionAdmitted: false }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

// #endregion
