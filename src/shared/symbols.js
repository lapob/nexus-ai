/** @module shared/symbols Offline Material Symbols shared with the Android clients. */
const { icons } = require('../../config/android-symbols.json');
const license = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../android/NexusRemote/app/src/main/assets/material-symbols-license.txt'), 'utf8');
if (license.includes('-->')) throw new Error('Unexpected Material Symbols license content.');
const symbolLicenseNotice = `<!-- Google Material Symbols, Apache-2.0.\n${license}\n-->`;

function symbolSvg(name) {
  const icon = Object.hasOwn(icons, name) && icons[name];
  if (!icon) throw new Error(`Unknown Nexus symbol: ${name}`);
  return `<svg class="nxs-symbol" viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path fill="currentColor" stroke="none" d="${icon.path}"/></svg>`;
}

module.exports = { symbolSvg, symbolLicenseNotice };
