/** @module scripts/generate-android-symbols Pinned, offline Material Symbols for Control and desktop/web clients. */
// #region Manifest and generated contracts
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'config/android-symbols.json');
const javaPath = path.join(root, 'android/shared-motion/src/main/java/local/nexus/motion/NexusSymbolPaths.java');
const rendererPath = path.join(root, 'src/renderer/components/NexusSymbolPaths.ts');
const assets = ['NexusConsole'].map(app => path.join(root, `android/${app}/app/src/main/assets/material-symbols-license.txt`));
const sha = value => createHash('sha256').update(value).digest('hex');

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.source !== 'https://github.com/google/material-design-icons'
    || !/^[a-f0-9]{40}$/.test(manifest.revision) || manifest.style !== 'materialsymbolsrounded') throw new Error('Invalid Material Symbols origin.');
  for (const [name, icon] of Object.entries(manifest.icons)) {
    if (!/^[A-Z][A-Za-z]+$/.test(name) || !/^[a-z_]+$/.test(icon.source)
      || !/^[MmLlHhVvCcSsQqTtAaZz\d., +\-Ee]+$/.test(icon.path || '') || icon.path.length > 20000
      || sha(icon.path) !== icon.pathSha256 || !/^[a-f0-9]{64}$/.test(icon.svgSha256 || '')) throw new Error(`Invalid symbol ${name}.`);
  }
}

function render(manifest) {
  validateManifest(manifest);
  const names = Object.keys(manifest.icons), revision = manifest.revision;
  const java = `// Generated from config/android-symbols.json; Google Material Symbols, Apache-2.0.\n// Source revision ${revision}; license bundled in Control and the desktop app.\npackage local.nexus.motion;\n\npublic final class NexusSymbolPaths {\n    private NexusSymbolPaths() {}\n    public static String path(String name) {\n        switch (name) {\n${names.map(name => `            case "${name}": return "${manifest.icons[name].path}";`).join('\n')}\n            default: throw new IllegalArgumentException("Unknown Nexus symbol: " + name);\n        }\n    }\n}\n`;
  // Keep the initial desktop bundle bounded: emit only its actual controls.
  const rendererNames = ['ContentCopy', 'Check', 'Restore', 'Download'];
  const renderer = '/** @module renderer/components/NexusSymbolPaths Generated from config/android-symbols.json; Material Symbols, Apache-2.0. */\n'
    + `export const symbolPaths = ${JSON.stringify(Object.fromEntries(rendererNames.map(name => [name, manifest.icons[name].path])), null, 2)} as const;\n`;
  return new Map([[javaPath, java], [rendererPath, renderer]]);
}
// #endregion

// #region Explicit maintainer refresh; never used by builds or runtime
async function refresh(manifest) {
  if (!/^[a-f0-9]{40}$/.test(manifest.revision)) throw new Error('Pin an official source revision first.');
  const base = `https://raw.githubusercontent.com/google/material-design-icons/${manifest.revision}`;
  const download = async relative => {
    const response = await fetch(`${base}/${relative}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Official symbol source returned ${response.status}: ${relative}`);
    const text = await response.text(); if (text.length > 30000) throw new Error('Unexpected symbol size.'); return text;
  };
  const pending = [...Object.entries(manifest.icons)];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (pending.length) {
      const [name, icon] = pending.shift();
      if (!/^[a-z_]+$/.test(icon.source)) throw new Error('Invalid symbol name.');
      const svg = await download(`symbols/web/${icon.source}/${manifest.style}/${icon.source}_24px.svg`);
      if (!/viewBox="0 -960 960 960"/.test(svg)) throw new Error(`Unexpected viewport: ${name}`);
      const paths = [...svg.matchAll(/<path\s+d="([^"]+)"/g)].map(match => match[1]);
      if (!paths.length || /<(?:script|image|use|foreignObject)\b/i.test(svg)) throw new Error(`Unexpected SVG: ${name}`);
      Object.assign(icon, { path: paths.join(' '), pathSha256: sha(paths.join(' ')), svgSha256: sha(svg) });
    }
  }));
  const license = await download('LICENSE');
  if (!license.includes('Apache License') || !license.includes('Version 2.0')) throw new Error('Unexpected symbol license.');
  manifest.licenseSha256 = sha(license);
  validateManifest(manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of assets) fs.writeFileSync(file, license);
}
// #endregion

// #region Offline verification and generation
async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (process.argv.includes('--refresh')) await refresh(manifest);
  for (const file of assets) if (sha(fs.readFileSync(file)) !== manifest.licenseSha256) throw new Error('Bundled symbol license mismatch.');
  for (const [file, content] of render(manifest)) {
    if (process.argv.includes('--check')) {
      if (fs.readFileSync(file, 'utf8') !== content) throw new Error(`Stale generated symbols: ${path.relative(root, file)}`);
    } else fs.writeFileSync(file, content);
  }
  console.log(`Material Symbols verified offline: ${Object.keys(manifest.icons).length} shared vectors.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateManifest, render };
// #endregion
