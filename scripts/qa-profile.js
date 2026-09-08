/** @module scripts/qa-profile
 * Owns an isolated test profile; call dispose only after its processes exit.
 */
const fs = require('node:fs');
const path = require('node:path');

function createQaProfile(parent, prefix) {
  if (!/^[a-z][a-z-]*-$/.test(prefix)) throw new Error('Invalid QA profile prefix');
  const root = path.resolve(parent);
  fs.mkdirSync(root, { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, prefix));
  return Object.freeze({
    path: profile,
    dispose() {
      if (path.dirname(profile) !== root || !path.basename(profile).startsWith(prefix)) throw new Error('QA profile outside owner directory');
      if (!fs.existsSync(profile)) return;
      for (let cursor = profile; ; cursor = path.dirname(cursor)) {
        if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Linked QA profile path');
        if (cursor === path.dirname(cursor)) break;
      }
      const inspect = directory => {
        for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
          if (item.isSymbolicLink()) throw new Error('Linked entry in QA profile');
          if (item.isDirectory()) inspect(path.join(directory, item.name));
        }
      };
      inspect(profile);
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
}
module.exports = { createQaProfile };
