/**
 * @module scripts/inventory-portable-tools
 * @description Inventaria gli strumenti portatili locali e genera un catalogo privato leggibile e verificabile.
 */
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Configurazione e classificazione

const workspace = path.resolve(__dirname, '..', '..');
const vault = path.resolve(process.env.NEXUS_PRIVATE_VAULT_PATH || path.join(workspace, '.knowledge-private'));
const portableRoot = path.parse(workspace).root;
const configuredRoots = String(process.env.NEXUS_TOOL_ROOTS || '').trim();
const defaultRoots = [
  `Sviluppo=${path.join(portableRoot, '[DEVELOPMENT]')}`,
  `Sicurezza=${path.join(portableRoot, '[HACKING]')}`
].filter((entry) => fs.existsSync(entry.slice(entry.indexOf('=') + 1))).join(';');
const roots = String(configuredRoots || defaultRoots)
  .split(';')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const separator = entry.indexOf('=');
    return separator > 0
      ? { area: entry.slice(0, separator).trim(), directory: path.resolve(entry.slice(separator + 1).trim()) }
      : null;
  })
  .filter((entry) => entry && fs.existsSync(entry.directory));
const allowed = new Set(['.exe', '.cmd', '.bat', '.ps1', '.jar', '.msi']);
const ignoredSegments = new Set(['node_modules', '.git', '__pycache__', 'cache', 'caches', 'locales', 'translations', 'tests', 'test']);
const umbrellas = new Set(['Cloud-SupplyChain', 'Network', 'OSINT', 'Password-Audit', 'Reverse-Engineering', 'Web-API']);

function productFor(area, relative) {
  const parts = relative.split(path.sep);
  if (area === 'Sicurezza' && umbrellas.has(parts[0]) && parts[1]) return `${parts[0]} / ${parts[1]}`;
  return parts[0] || 'Altro';
}

function riskFor(relative) {
  if (/password|hashcat|john|sqlmap|ffuf|burp|scanner|amass|harvester|sherlock/i.test(relative)) return 'elevato';
  if (/sysinternals|forensic|wireshark|tshark|yara|ghidra|cutter|x64dbg|dnspy/i.test(relative)) return 'controllato';
  return 'ordinario';
}

function walk(directory, base, output) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredSegments.has(entry.name.toLocaleLowerCase('en-US'))) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, base, output);
    else if (allowed.has(path.extname(entry.name).toLocaleLowerCase('en-US'))) output.push({ target, relative: path.relative(base, target) });
  }
}

function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes;
    do {
      bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes) hash.update(buffer.subarray(0, bytes));
    } while (bytes);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function prepareGeneratedFile(file) {
  if (process.platform !== 'win32' || !fs.existsSync(file)) return;
  // Node/Windows rifiuta talvolta il truncate di un file Hidden con EPERM.
  // Il contenitore .nexus resta nascosto; il singolo artefatto generato non
  // ha bisogno di conservare attributi che impediscono l'aggiornamento.
  const result = spawnSync('attrib.exe', ['-H', '-R', file], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Impossibile rendere aggiornabile l'inventario: ${result.stderr || result.stdout || file}`);
  }
}

// #endregion

// #region 02 — Inventario e documenti

const tools = [];
for (const root of roots) {
  const files = [];
  walk(root.directory, root.directory, files);
  for (const file of files) {
    const stat = fs.statSync(file.target);
    tools.push({
      area: root.area,
      product: productFor(root.area, file.relative),
      name: path.basename(file.target),
      relativePath: path.join(path.basename(root.directory), file.relative).replaceAll('\\', '/'),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha256: hashFile(file.target),
      risk: riskFor(file.relative),
      local: true
    });
  }
}
tools.sort((left, right) => left.area.localeCompare(right.area, 'it') || left.product.localeCompare(right.product, 'it') || left.name.localeCompare(right.name, 'it'));
const generatedAt = new Date().toISOString();
const generatedDate = generatedAt.slice(0, 10);
const manifestDirectory = path.join(vault, '.nexus');
const notesDirectory = path.join(vault, '05_Risorse', 'Strumenti locali');
fs.mkdirSync(manifestDirectory, { recursive: true });
fs.mkdirSync(notesDirectory, { recursive: true });
const inventoryPath = path.join(manifestDirectory, 'tool-inventory.json');
prepareGeneratedFile(inventoryPath);
fs.writeFileSync(inventoryPath, `${JSON.stringify({ schema: 1, generatedAt, roots: roots.map(({ area, directory }) => ({ area, directory })), tools }, null, 2)}\n`);

const groups = Map.groupBy(tools, (tool) => `${tool.area}\u0000${tool.product}`);
const indexLines = [
  '---', 'type: index', 'area: resources', 'status: verified', 'level: foundation',
  `created: ${generatedDate}`, `updated: ${generatedDate}`,
  `verified_at: ${generatedAt.slice(0, 10)}`, `review_after: ${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}`,
  'source_kind: local-inventory', 'tags: [strumenti, inventario, portatile, automatico]', 'aliases: [Inventario strumenti locali]', '---',
  '# Strumenti disponibili su SSD', '',
  'Questa pagina è generata automaticamente. Presenta gli strumenti rilevati senza eseguirli e senza indicizzare dati personali, profili, report o wordlist.', '',
  '> [!info] Uso semplice',
  '> Cerca il nome di uno strumento. La relativa scheda indica a cosa serve, quando evitarlo e quali autorizzazioni richiede.', '',
  `Ultima ricognizione: **${generatedAt.replace('T', ' ').slice(0, 19)} UTC** · **${groups.size} prodotti** · **${tools.length} entry point verificati tramite SHA-256**.`, ''
];
for (const area of [...new Set(tools.map((tool) => tool.area))]) {
  indexLines.push(`## ${area}`, '');
  for (const [key, entries] of groups) {
    const [groupArea, product] = key.split('\u0000');
    if (groupArea !== area) continue;
    const slug = product.replace(/[\\/:*?"<>|]/g, ' - ').replace(/\s+/g, ' ').trim();
    indexLines.push(`- [[05_Risorse/Strumenti locali/${slug}|${product}]] — ${entries.length} componenti`);
  }
  indexLines.push('');
}
const toolsIndexPath = path.join(notesDirectory, 'Indice - Strumenti locali.md');
prepareGeneratedFile(toolsIndexPath);
fs.writeFileSync(toolsIndexPath, `${indexLines.join('\n')}\n`);

for (const [key, entries] of groups) {
  const [area, product] = key.split('\u0000');
  const slug = product.replace(/[\\/:*?"<>|]/g, ' - ').replace(/\s+/g, ' ').trim();
  const risk = entries.some((entry) => entry.risk === 'elevato') ? 'elevato' : entries.some((entry) => entry.risk === 'controllato') ? 'controllato' : 'ordinario';
  const rows = entries.slice(0, 220).map((entry) => `| \`${entry.name}\` | ${(entry.size / 1048576).toFixed(2)} MB | \`${entry.sha256.slice(0, 16)}…\` |`);
  const content = [
    '---', 'type: tool-profile', `area: ${area.toLocaleLowerCase('it-IT')}`, 'status: verified', 'level: foundation',
    `created: ${generatedDate}`, `updated: ${generatedDate}`,
    `verified_at: ${generatedAt.slice(0, 10)}`, `review_after: ${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}`,
    'source_kind: local-inventory', `tags: [strumenti, ${area.toLocaleLowerCase('it-IT').replace(/\s+/g, '-')}, portatile]`, `aliases: [${JSON.stringify(product)}]`, '---',
    `# ${product}`, '',
    `Strumento o famiglia rilevata nell’area **${area}** dell’SSD portatile. Lo stato locale è verificato tramite metadati e hash; capacità e sintassi operative devono essere confermate sulla documentazione ufficiale della versione installata.`, '',
    '## Uso semplice', '',
    '- **Disponibilità:** presente localmente.',
    `- **Profilo di rischio:** ${risk}.`,
    '- **Regola predefinita:** NexusNXS mostra prima scopo, input e conseguenze; l’esecuzione richiede il livello di autorizzazione configurato.',
    '- **Modalità principiante:** usare procedure guidate e ambienti di laboratorio; i parametri avanzati restano nascosti finché non richiesti.', '',
    '## Componenti rilevati', '', '| Componente | Dimensione | SHA-256 abbreviato |', '|---|---:|---|', ...rows, '',
    '## Controlli prima dell’uso', '',
    '1. Confermare obiettivo, sistema o progetto autorizzato e cartella di output.',
    '2. Verificare versione, firma o hash e documentazione ufficiale.',
    '3. Preferire analisi non distruttive e input di test.',
    '4. Conservare log, timestamp e risultati senza includere segreti.',
    '5. Interrompere l’attività se lo scope non è chiaro.', '',
    '## Limiti', '',
    'La presenza del file non garantisce compatibilità, configurazione corretta o autorizzazione. NexusNXS non deve dedurre permessi operativi dal solo inventario.', '',
    '## Collegamenti', '',
    '- [[05_Risorse/Strumenti locali/Indice - Strumenti locali|Indice degli strumenti locali]]',
    '- [[05_Risorse/Metodo professionale per comandi procedure e troubleshooting|Metodo professionale per procedure e troubleshooting]]',
    '- [[02_Cybersecurity/Ethical Hacking/Regole di ingaggio e reporting|Regole di ingaggio e reporting]]'
  ];
  const profilePath = path.join(notesDirectory, `${slug}.md`);
  prepareGeneratedFile(profilePath);
  fs.writeFileSync(profilePath, `${content.join('\n')}\n`);
}
process.stdout.write(`Inventario SSD: ${tools.length} entry point, ${groups.size} prodotti, ${roots.length} aree.\n`);

// #endregion
