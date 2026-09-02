/**
 * @module scripts/after-pack
 * @description Rimuove cache e suite di test dai runtime Python copiati nel pacchetto finale.
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function afterPack(context) {
  const root = path.join(context.appOutDir, 'resources', 'kokoro', '.venv', 'Lib', 'site-packages');
  if (!fs.existsSync(root)) return;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory() && ['__pycache__', 'test', 'tests'].includes(entry.name.toLowerCase())) {
        fs.rmSync(target, { recursive: true, force: true });
      } else if (entry.isDirectory()) visit(target);
      else if (/\.pyc$/i.test(entry.name)) fs.rmSync(target, { force: true });
    }
  };
  visit(root);
};
