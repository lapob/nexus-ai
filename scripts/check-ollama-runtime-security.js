/**
 * @module scripts/check-ollama-runtime-security
 * @description Gate CLI fail-closed del runtime Ollama usato dalla workstation.
 */
const path = require('node:path');
const { assertOllamaRuntimeSecure } = require('../src/ai/ollama-runtime-security');

const root = path.resolve(__dirname, '..');
const executableArgument = process.argv.find((argument) => argument.startsWith('--executable='));
const executable = executableArgument
  ? path.resolve(executableArgument.slice('--executable='.length))
  : path.join(root, 'vendor', 'ollama', 'windows-x64', process.platform === 'win32' ? 'ollama.exe' : 'ollama');
const developmentLoopback = process.argv.includes('--development-loopback');

try {
  const result = assertOllamaRuntimeSecure(executable, developmentLoopback
    ? { usage: 'development', host: '127.0.0.1' }
    : { usage: 'distribution' });
  process.stdout.write(`[NEXUSNXS SECURITY] Ollama ${result.version} verificato · SHA256 ${result.sha256}\n`);
  for (const warning of result.warnings) {
    process.stderr.write(`[NEXUSNXS SECURITY] WARNING ${warning.code}: ${warning.message}\n`);
  }
} catch (error) {
  const findings = Array.isArray(error?.details?.findings)
    ? ` · ${error.details.findings.slice(0, 5).map((item) => item.id).filter(Boolean).join(', ')}`
    : '';
  process.stderr.write(`[NEXUSNXS SECURITY] ${error.message}${findings}\n`);
  process.exitCode = 1;
}
