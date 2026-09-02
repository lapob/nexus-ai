/**
 * @module agents/action-runtime
 * @description Pianifica ed esegue azioni di sistema soltanto tramite consenso monouso.
 */
// #region 01 — Contratti e catalogo strumenti

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { sanitizeLogValue } = require('../services/logger');
const { createActionReceipt } = require('../security/action-receipt');
const { assertVerifiedDeviceIdentity } = require('../security/device-identity');

const MAX_OUTPUT = 64 * 1024;
const TICKET_TTL_MS = 5 * 60 * 1000;
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.py', '.ps1', '.sh']);
const SENSITIVE_FILE_NAME = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|credentials?(?:\.[^.]+)?|secrets?(?:\.[^.]+)?|.*\.(?:pem|pfx|p12|key|kdbx))$/i;
// Il comando generico non deve trasformarsi in una seconda shell. Gli
// interpreti sono disponibili esclusivamente tramite run_script, che verifica
// realpath, estensione e appartenenza alla vault prima dell'esecuzione.
const COMMANDS = new Set(['npm']);
const ARTIFACT_CONTENT_LIMIT = 48 * 1024;
const MAX_PENDING_TICKETS = 256;
const CHILD_ENV_KEYS = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'LANG', 'LC_ALL', 'TERM'
]);

const APPLICATIONS = Object.freeze({
  win32: Object.freeze({
    nexusnxs: {
      label: 'NexusNXS',
      command: process.execPath,
      args: process.defaultApp ? [path.resolve(__dirname, '..', '..'), '--ui'] : ['--ui']
    },
    calculator: { label: 'Calcolatrice', command: 'calc.exe' },
    browser: { label: 'Browser predefinito', uri: 'https://www.google.com/' },
    brave: {
      label: 'Brave',
      commands: [
        path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(process.env.ProgramFiles || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(process.env['ProgramFiles(x86)'] || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        'brave.exe'
      ]
    },
    files: { label: 'Esplora file', command: 'explorer.exe' },
    notepad: { label: 'Blocco note', command: 'notepad.exe' },
    notion: {
      label: 'Notion',
      commands: [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Notion', 'Notion.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Notion', 'Notion.exe'),
        path.join(process.env.ProgramFiles || '', 'Notion', 'Notion.exe'),
        'Notion.exe'
      ]
    },
    paint: { label: 'Paint', command: 'mspaint.exe' },
    screenshot: { label: 'Strumento di cattura', command: 'SnippingTool.exe' },
    taskmanager: { label: 'Gestione attività', command: 'taskmgr.exe' },
    terminal: { label: 'Terminale', command: 'wt.exe', fallback: 'powershell.exe' },
    vscode: { label: 'Visual Studio Code', command: 'code.cmd' },
    obsidian: { label: 'Obsidian', uri: 'obsidian://open' },
    settings: { label: 'Impostazioni di Windows', uri: 'ms-settings:' }
  }),
  darwin: Object.freeze({
    calculator: { label: 'Calcolatrice', command: 'open', args: ['-a', 'Calculator'] },
    browser: { label: 'Browser predefinito', command: 'open', args: ['https://www.google.com/'] },
    files: { label: 'Finder', command: 'open', args: ['.'] },
    notepad: { label: 'TextEdit', command: 'open', args: ['-a', 'TextEdit'] },
    terminal: { label: 'Terminale', command: 'open', args: ['-a', 'Terminal'] },
    vscode: { label: 'Visual Studio Code', command: 'open', args: ['-a', 'Visual Studio Code'] },
    obsidian: { label: 'Obsidian', uri: 'obsidian://open' }
  }),
  linux: Object.freeze({
    calculator: { label: 'Calcolatrice', command: 'gnome-calculator' },
    browser: { label: 'Browser predefinito', command: 'xdg-open', args: ['https://www.google.com/'] },
    files: { label: 'File manager', command: 'xdg-open', args: ['.'] },
    notepad: { label: 'Editor di testo', command: 'gedit' },
    terminal: { label: 'Terminale', command: 'x-terminal-emulator' },
    vscode: { label: 'Visual Studio Code', command: 'code' },
    obsidian: { label: 'Obsidian', uri: 'obsidian://open' }
  })
});

const TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({ name: 'open_application', label: 'Apri applicazione', risk: 'medium', description: 'Apre un’applicazione nota installata nel sistema.' }),
  Object.freeze({ name: 'open_path', label: 'Apri file o cartella', risk: 'medium', description: 'Apre un percorso esistente contenuto nella vault NexusNXS.' }),
  Object.freeze({ name: 'open_user_path', label: 'Apri file personale', risk: 'medium', description: 'Apre un file o una cartella esistente nella home dell’utente.' }),
  Object.freeze({ name: 'run_script', label: 'Esegui script', risk: 'high', description: 'Esegue uno script supportato contenuto nella vault NexusNXS.' }),
  Object.freeze({ name: 'run_command', label: 'Esegui comando', risk: 'high', description: 'Esegue un programma consentito con argomenti separati, senza shell implicita.' }),
  Object.freeze({ name: 'list_directory', label: 'Esamina cartella', risk: 'low', description: 'Elenca file e cartelle nello spazio di lavoro attivo.' }),
  Object.freeze({ name: 'read_file', label: 'Leggi file', risk: 'low', description: 'Legge un file di testo nello spazio di lavoro attivo.' }),
  Object.freeze({ name: 'write_file', label: 'Crea o modifica file', risk: 'high', description: 'Crea o sovrascrive un file di testo nello spazio di lavoro attivo.' }),
  Object.freeze({ name: 'write_files', label: 'Crea progetto', risk: 'high', description: 'Crea o aggiorna fino a 20 file di testo in una sola attività verificabile.' }),
  Object.freeze({ name: 'create_directory', label: 'Crea cartella', risk: 'medium', description: 'Crea una cartella nello spazio di lavoro attivo.' }),
  Object.freeze({ name: 'copy_path', label: 'Copia elemento', risk: 'medium', description: 'Copia un file o una cartella nello spazio di lavoro attivo.' }),
  Object.freeze({ name: 'move_path', label: 'Sposta o rinomina', risk: 'high', description: 'Sposta o rinomina un file o una cartella nello spazio di lavoro attivo.' }),
  Object.freeze({ name: 'trash_path', label: 'Sposta nel cestino', risk: 'high', description: 'Sposta un file o una cartella nel cestino del sistema.' })
]);

const TOOL_EFFECTS = Object.freeze({
  open_application: Object.freeze({ effect: 'launch', rollback: 'close-manually' }),
  open_path: Object.freeze({ effect: 'read', rollback: 'not-required' }),
  open_user_path: Object.freeze({ effect: 'read', rollback: 'not-required' }),
  run_script: Object.freeze({ effect: 'execute', rollback: 'not-guaranteed' }),
  run_command: Object.freeze({ effect: 'execute', rollback: 'not-guaranteed' }),
  list_directory: Object.freeze({ effect: 'read', rollback: 'not-required' }),
  read_file: Object.freeze({ effect: 'read', rollback: 'not-required' }),
  write_file: Object.freeze({ effect: 'write', rollback: 'automatic' }),
  write_files: Object.freeze({ effect: 'write', rollback: 'automatic' }),
  create_directory: Object.freeze({ effect: 'write', rollback: 'manual' }),
  copy_path: Object.freeze({ effect: 'write', rollback: 'manual' }),
  move_path: Object.freeze({ effect: 'write', rollback: 'manual' }),
  trash_path: Object.freeze({ effect: 'delete', rollback: 'system-trash' })
});

// #endregion

// #region 02 — Validazione e runtime con consenso

function asText(value, name, max = 4096) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} è obbligatorio.`);
  if (text.length > max || text.includes('\0')) throw new Error(`${name} non è valido.`);
  return text;
}

function asArguments(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw new Error('Gli argomenti devono essere un array con massimo 64 elementi.');
  return value.map((item) => asText(item, 'Argomento', 4096));
}

function artifactLanguage(filePath = '') {
  return ({
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'jsx',
    '.ts': 'typescript', '.tsx': 'tsx', '.json': 'json', '.css': 'css', '.scss': 'scss',
    '.html': 'html', '.md': 'markdown', '.py': 'python', '.ps1': 'powershell',
    '.sh': 'shell', '.yml': 'yaml', '.yaml': 'yaml', '.xml': 'xml', '.sql': 'sql'
  })[path.extname(filePath).toLowerCase()] || 'text';
}

function outputDiagnostics(output, root) {
  const diagnostics = [];
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/((?:[A-Za-z]:)?[^()\s:]+\.(?:js|mjs|cjs|jsx|ts|tsx|json|css|scss|py|ps1|sh)):(\d+)(?::(\d+))?/i);
    if (!match) continue;
    const target = path.resolve(root, match[1]);
    if (target !== root && !isInside(root, target)) continue;
    diagnostics.push({ file: path.relative(root, target), line: Number(match[2]), column: Number(match[3]) || 0, message: line.replace(match[0], '').replace(/^\s*[-:]?\s*/, '').slice(0, 300) || 'Controlla questa posizione.' });
    if (diagnostics.length >= 12) break;
  }
  return diagnostics;
}

function compactArtifact(ticket, result, root, before = '') {
  const relativePath = ticket.args?.path ? path.relative(root, ticket.args.path) : '';
  if (ticket.tool === 'write_file') {
    const content = String(ticket.args.content || '');
    const preview = textDiffPreview(before, content);
    return {
      id: `${ticket.id}-file`, kind: 'file-change', title: relativePath || 'File modificato',
      subtitle: before ? 'Modificato' : 'Creato', language: artifactLanguage(relativePath),
      content: content.slice(0, ARTIFACT_CONTENT_LIMIT), added: preview.added,
      removed: preview.removed, previousContent: before.slice(0, ARTIFACT_CONTENT_LIMIT),
      diff: preview.excerpt.slice(0, ARTIFACT_CONTENT_LIMIT),
      events: [
        { label: before ? 'Versione precedente acquisita' : 'Nuovo file preparato', status: 'complete' },
        { label: before ? 'Modifica applicata' : 'File creato', status: 'complete' },
        { label: result.validation === 'json-valid' ? 'JSON riletto e validato' : 'Scrittura riletta e verificata', status: result.verification === 'write-complete' ? 'complete' : 'warning' }
      ],
      truncated: content.length > ARTIFACT_CONTENT_LIMIT || before.length > ARTIFACT_CONTENT_LIMIT
    };
  }
  if (ticket.tool === 'run_command' || ticket.tool === 'run_script') {
    const command = ticket.tool === 'run_script'
      ? [relativePath, ...(ticket.args.args || [])].join(' ')
      : [ticket.args.command, ...(ticket.args.args || [])].join(' ');
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').slice(0, ARTIFACT_CONTENT_LIMIT);
    const diagnostics = outputDiagnostics([result.stdout, result.stderr].filter(Boolean).join('\n'), root);
    return {
      id: `${ticket.id}-command`, kind: 'command', title: command || 'Comando eseguito',
      subtitle: result.code === 0 ? 'Completato' : `Codice ${result.code ?? '?'}`,
      language: ticket.tool === 'run_script' ? artifactLanguage(relativePath) : 'shell',
      content: output || command, truncated: String(result.stdout || '').length + String(result.stderr || '').length > ARTIFACT_CONTENT_LIMIT,
      events: [{ label: 'Comando autorizzato', status: 'complete' }, { label: 'Processo terminato', status: result.code === 0 ? 'complete' : 'warning' }],
      ...(diagnostics.length ? { diagnostics } : {})
    };
  }
  if (ticket.tool === 'read_file') {
    const content = String(result.stdout || '');
    return {
      id: `${ticket.id}-file`, kind: 'file', title: relativePath || 'File letto',
      subtitle: 'Consultato', language: artifactLanguage(relativePath),
      content: content.slice(0, ARTIFACT_CONTENT_LIMIT), truncated: content.length > ARTIFACT_CONTENT_LIMIT
      , events: [{ label: 'File letto', status: 'complete' }]
    };
  }
  if (['create_directory', 'copy_path', 'move_path', 'trash_path'].includes(ticket.tool)) {
    const target = ticket.args.destination || ticket.args.path || ticket.args.source;
    return {
      id: `${ticket.id}-operation`, kind: 'file-operation',
      title: path.relative(root, target) || 'Operazione completata',
      subtitle: result.message, language: 'text', content: result.message,
      events: [{ label: 'Operazione autorizzata', status: 'complete' }, { label: 'Risultato verificato', status: 'complete' }]
    };
  }
  return null;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function workspaceFingerprint(root) {
  return createHash('sha256').update(fs.realpathSync(root)).digest('hex');
}

function contentFingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileFingerprint(filePath) {
  return contentFingerprint(fs.readFileSync(filePath));
}

function opaqueSubjectFingerprint(value) {
  const subject = String(value || '').trim().slice(0, 128);
  return subject
    ? createHash('sha256').update('nexusnxs-session-subject-v1\0').update(subject).digest('hex')
    : '';
}

function checkpointTransactionKey(value) {
  return createHash('sha256')
    .update('nexusnxs-checkpoint-transaction-v1\0')
    .update(String(value || ''))
    .digest('hex');
}

function actionSubjectBinding({ subjectId = '', deviceIdentity = null } = {}) {
  if (deviceIdentity !== null && deviceIdentity !== undefined) {
    const identity = assertVerifiedDeviceIdentity(deviceIdentity);
    if (subjectId && String(subjectId).trim() !== String(identity.deviceId || '')) {
      throw Object.assign(new Error('L’identita verificata non corrisponde alla sessione dichiarata.'), { code: 'CAPABILITY_SUBJECT_MISMATCH' });
    }
    return {
      subjectId: identity.subjectId,
      subjectKind: 'verified-device',
      keyFingerprint: identity.keyFingerprint,
      identityBound: true
    };
  }
  const fingerprint = opaqueSubjectFingerprint(subjectId);
  return {
    subjectId: fingerprint,
    subjectKind: fingerprint ? 'opaque-session' : 'local',
    keyFingerprint: '',
    identityBound: false
  };
}

function containsPrivateSegment(root, target) {
  const relative = path.relative(root, target);
  return relative.split(path.sep).some((segment) => segment.startsWith('.'));
}

function executableAvailable(command, environment = process.env) {
  if (!command) return false;
  if (path.isAbsolute(command)) return fs.existsSync(command);
  const directories = String(environment.PATH || environment.Path || '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? String(environment.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  const hasExtension = Boolean(path.extname(command));
  return directories.some((directory) => {
    const candidates = hasExtension ? [command] : extensions.map((extension) => `${command}${extension.toLowerCase()}`);
    return candidates.some((candidate) => fs.existsSync(path.join(directory, candidate)));
  });
}

function applicationAvailable(application) {
  if (application.uri) return true;
  const commands = application.commands || [application.command, application.fallback].filter(Boolean);
  return commands.some((command) => executableAvailable(command));
}

function resolveInsideRoot(root, value, { allowRoot = false } = {}) {
  const target = path.resolve(root, asText(value, 'Il percorso'));
  if ((!allowRoot && target === root) || (target !== root && !isInside(root, target))) throw new Error('Il percorso deve rimanere nella vault NexusNXS.');
  if (target !== root && containsPrivateSegment(root, target)) throw new Error('Le cartelle interne dell’app non sono accessibili.');
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.realpathSync(target);
  if ((realTarget !== realRoot || !allowRoot) && !isInside(realRoot, realTarget)) throw new Error('Il percorso risolto esce dalla vault NexusNXS.');
  if (realTarget !== realRoot && containsPrivateSegment(realRoot, realTarget)) throw new Error('Le cartelle interne dell’app non sono accessibili.');
  return realTarget;
}

function resolveWritableInsideRoot(root, value) {
  const target = path.resolve(root, asText(value, 'Il percorso'));
  if (target === root || !isInside(root, target) || containsPrivateSegment(root, target)) throw new Error('Il file deve rimanere nello spazio di lavoro.');
  const realRoot = fs.realpathSync(root);
  if (fs.existsSync(target)) {
    const realTarget = fs.realpathSync(target);
    if (!isInside(realRoot, realTarget) || containsPrivateSegment(realRoot, realTarget)) throw new Error('Il file di destinazione esce dallo spazio di lavoro.');
  }
  let ancestor = path.dirname(target);
  while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor);
  const realAncestor = fs.realpathSync(ancestor);
  if (realAncestor !== realRoot && !isInside(realRoot, realAncestor)) throw new Error('La cartella di destinazione esce dallo spazio di lavoro.');
  return target;
}

function normalizeCommand(value) {
  const command = asText(value, 'Il comando', 128).toLowerCase().replace(/\.exe$/i, '');
  if (!COMMANDS.has(command)) throw new Error(`Comando non consentito: ${command}.`);
  return process.platform === 'win32' && command === 'powershell' ? 'powershell.exe' : command;
}

function validateCommandArguments(command, value) {
  const args = asArguments(value);
  if (command !== 'npm') throw new Error('Usa “Esegui script” per interpreti e file di codice.');
  if (args[0] !== 'run' || !/^[A-Za-z0-9:_-]{1,80}$/.test(args[1] || '') || (args.length > 2 && args[2] !== '--')) {
    throw new Error('Sono consentiti soltanto script npm dichiarati, nel formato npm run <script>.');
  }
  return args;
}

function interpreterFor(scriptPath) {
  const extension = path.extname(scriptPath).toLowerCase();
  if (!SCRIPT_EXTENSIONS.has(extension)) throw new Error(`Tipo di script non supportato: ${extension || 'senza estensione'}.`);
  if (['.js', '.mjs', '.cjs'].includes(extension)) return { command: 'node', prefix: [] };
  if (extension === '.py') return { command: process.platform === 'win32' ? 'python' : 'python3', prefix: [] };
  if (extension === '.ps1') return { command: process.platform === 'win32' ? 'powershell.exe' : 'pwsh', prefix: ['-NoProfile', '-File'] };
  return { command: 'bash', prefix: [] };
}

function parseAgentPlan(value) {
  const text = String(value ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!candidate) throw new Error('Il modello non ha restituito un piano JSON valido.');
  const plan = JSON.parse(candidate);
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('Piano azione non valido.');
  if (plan.tool === null || plan.tool === undefined) return { summary: asText(plan.summary || 'Nessuna azione proposta.', 'La sintesi', 1000), tool: null, arguments: {} };
  return {
    summary: asText(plan.summary, 'La sintesi', 1000),
    reason: String(plan.reason || '').trim().slice(0, 1000),
    tool: asText(plan.tool, 'Lo strumento', 64),
    arguments: plan.arguments && typeof plan.arguments === 'object' && !Array.isArray(plan.arguments) ? plan.arguments : {}
  };
}

// Gli script autorizzati ricevono soltanto variabili operative essenziali.
// Token, chiavi API e credenziali eventualmente presenti nell'ambiente
// dell'applicazione non devono propagarsi automaticamente ai processi figli.
function sanitizedChildEnvironment(source = process.env) {
  const safe = {};
  for (const key of CHILD_ENV_KEYS) {
    if (typeof source[key] === 'string' && source[key]) safe[key] = source[key];
  }
  safe.NEXUS_ACTION_CONTEXT = 'approved-local-action';
  return safe;
}

// L'audit delle azioni conserva soltanto metadati operativi. I preview mostrati
// nella UI possono contenere diff, argomenti o output utili alla persona, ma
// non devono essere duplicati integralmente nel registro persistente.
function sanitizeAuditEvent(value = {}) {
  const event = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = {};
  for (const key of ['event', 'tool', 'approvalMode', 'verification']) {
    if (event[key] !== undefined) output[key] = String(sanitizeLogValue(event[key], key)).slice(0, 128);
  }
  if (event.preview) {
    output.preview = String(sanitizeLogValue(String(event.preview).split(/\r?\n/, 1)[0], 'preview')).slice(0, 500);
  }
  if (event.error) {
    const message = event.error instanceof Error ? event.error.message : event.error;
    output.error = String(sanitizeLogValue(message, 'error')).slice(0, 500);
  }
  if (Number.isFinite(event.code) || event.code === null) output.code = event.code;
  return output;
}

function terminateOwnedProcessTree(child, platform = process.platform) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return false;
  if (platform === 'win32' && Number.isInteger(child.pid)) {
    const result = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore'
    });
    if (result.status === 0) return true;
  }
  try { return child.kill('SIGKILL'); } catch { return false; }
}

function actionCancelledError(message = 'Azione annullata dal dispositivo che l’ha avviata.') {
  return Object.assign(new Error(message), { name: 'AbortError', code: 'ACTION_CANCELLED' });
}

function assertActionNotAborted(signal) {
  if (signal?.aborted) throw actionCancelledError();
}

function runProcess(command, args, { cwd, timeoutMs = 120000, onOutput, processRegistry = null, platform = process.platform, signal } = {}) {
  if (signal?.aborted) return Promise.reject(actionCancelledError());
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let processExited = false;
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, env: sanitizedChildEnvironment() });
    let resolveExited;
    const exited = new Promise((resolveExit) => { resolveExited = resolveExit; });
    let timer;
    let abortProcess = null;
    const removeAbortListener = () => {
      if (abortProcess) signal?.removeEventListener('abort', abortProcess);
      abortProcess = null;
    };
    const entry = {
      child,
      exited,
      cancel(reason = 'Azione interrotta perché NexusNXS è stato chiuso.', cancellationError = null) {
        removeAbortListener();
        if (!processExited) terminateOwnedProcessTree(child, platform);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(cancellationError || new Error(reason));
        }
        return exited;
      }
    };
    processRegistry?.add(entry);
    const append = (current, chunk) => (current + chunk.toString('utf8')).slice(-MAX_OUTPUT);
    child.stdout?.on('data', (chunk) => { if (!settled) { stdout = append(stdout, chunk); onOutput?.({ stream: 'stdout', text: chunk.toString('utf8') }); } });
    child.stderr?.on('data', (chunk) => { if (!settled) { stderr = append(stderr, chunk); onOutput?.({ stream: 'stderr', text: chunk.toString('utf8') }); } });
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      terminateOwnedProcessTree(child, platform);
      reject(new Error(`Azione interrotta dopo ${timeoutMs / 1000} secondi.`));
    }, timeoutMs);
    abortProcess = () => entry.cancel('Azione annullata dal dispositivo che l’ha avviata.', actionCancelledError());
    signal?.addEventListener('abort', abortProcess, { once: true });
    if (signal?.aborted) abortProcess();
    child.once('error', (error) => {
      processExited = true;
      clearTimeout(timer);
      removeAbortListener();
      processRegistry?.delete(entry);
      resolveExited();
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('exit', (code, signal) => {
      processExited = true;
      clearTimeout(timer);
      removeAbortListener();
      processRegistry?.delete(entry);
      resolveExited();
      if (settled) return;
      settled = true;
      resolve({ code, signal, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function textDiffPreview(before, after, maxLines = 12) {
  const oldLines = String(before || '').split(/\r?\n/);
  const newLines = String(after || '').split(/\r?\n/);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let oldTail = oldLines.length - 1;
  let newTail = newLines.length - 1;
  while (oldTail >= prefix && newTail >= prefix && oldLines[oldTail] === newLines[newTail]) { oldTail -= 1; newTail -= 1; }
  const removed = oldLines.slice(prefix, oldTail + 1);
  const added = newLines.slice(prefix, newTail + 1);
  const excerpt = [...removed.map((line) => `− ${line}`), ...added.map((line) => `+ ${line}`)].slice(0, maxLines);
  return { removed: removed.length, added: added.length, excerpt: excerpt.join('\n') };
}

function launchDetached(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true, env: sanitizedChildEnvironment() });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

class ActionRuntime {
  constructor({ vaultPath, userPath = os.homedir(), auditPath, checkpointDirectory, receiptPath, receiptSigner = null, securityEventStore = null, shell, logger, platform = process.platform, now = () => Date.now(), applicationProbe = applicationAvailable }) {
    this.vaultPath = fs.realpathSync(vaultPath);
    this.userPath = fs.realpathSync(userPath);
    this.auditPath = auditPath;
    this.checkpointDirectory = checkpointDirectory || path.join(path.dirname(auditPath), 'action-checkpoints');
    this.receiptPath = receiptPath || path.join(path.dirname(auditPath), 'action-receipts.jsonl');
    this.receiptSigner = typeof receiptSigner === 'function' ? receiptSigner : null;
    this.shell = shell;
    this.logger = logger;
    this.securityEventStore = securityEventStore;
    this.platform = platform;
    this.now = now;
    this.applicationProbe = applicationProbe;
    this.tickets = new Map();
    this.activeProcesses = new Set();
    this.acceptingActions = true;
  }

  setWorkspaceRoot(workspacePath) {
    this.vaultPath = fs.realpathSync(workspacePath);
    return this.vaultPath;
  }

  capabilities() {
    const applications = APPLICATIONS[this.platform] || APPLICATIONS.linux;
    return {
      tools: TOOL_DEFINITIONS.map((tool) => ({ ...tool, ...TOOL_EFFECTS[tool.name] })),
      applications: Object.entries(applications)
        .filter(([, app]) => this.applicationProbe(app))
        .map(([id, app]) => ({ id, label: app.label })),
      policy: {
        approval: 'every-action', ticketTtlMs: TICKET_TTL_MS,
        capability: 'single-use-workspace-and-device-bound', dryRun: 'required-before-execution',
        audit: 'local-metadata-only-tamper-evident', rollback: 'automatic-and-state-verified-for-file-writes',
        receipts: this.receiptSigner ? 'signed-metadata-only' : 'digest-only-metadata-only'
      }
    };
  }

  async shutdown({ timeoutMs = 2_500 } = {}) {
    this.acceptingActions = false;
    this.tickets.clear();
    const active = [...this.activeProcesses];
    if (!active.length) return { terminated: 0, timedOut: false };
    const completion = Promise.allSettled(active.map((entry) => entry.cancel()));
    let timedOut = false;
    let timeout;
    await Promise.race([completion, new Promise((resolve) => {
      timeout = setTimeout(() => { timedOut = true; resolve(); }, timeoutMs);
    })]);
    clearTimeout(timeout);
    this.activeProcesses.clear();
    return { terminated: active.length, timedOut };
  }

  validate(tool, input = {}) {
    const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    if (tool === 'open_application') {
      const application = asText(args.application, 'L’applicazione', 64).toLowerCase();
      const applications = APPLICATIONS[this.platform] || APPLICATIONS.linux;
      if (!applications[application]) throw new Error(`Applicazione non consentita: ${application}.`);
      return { application };
    }
    if (tool === 'open_path') {
      const target = resolveInsideRoot(this.vaultPath, args.path, { allowRoot: true });
      return { path: target };
    }
    if (tool === 'open_user_path') {
      const target = resolveInsideRoot(this.userPath, args.path, { allowRoot: true });
      return { path: target };
    }
    if (tool === 'run_script') {
      const script = resolveInsideRoot(this.vaultPath, args.path);
      if (!fs.statSync(script).isFile()) throw new Error('Lo script deve essere un file.');
      interpreterFor(script);
      const cwd = args.cwd ? resolveInsideRoot(this.vaultPath, args.cwd, { allowRoot: true }) : path.dirname(script);
      return { path: script, args: asArguments(args.args), cwd };
    }
    if (tool === 'run_command') {
      const cwd = args.cwd ? resolveInsideRoot(this.vaultPath, args.cwd, { allowRoot: true }) : this.vaultPath;
      const command = normalizeCommand(args.command);
      return { command, args: validateCommandArguments(command, args.args), cwd };
    }
    if (tool === 'list_directory') {
      return { path: resolveInsideRoot(this.vaultPath, args.path || '.', { allowRoot: true }) };
    }
    if (tool === 'read_file') {
      const target = resolveInsideRoot(this.vaultPath, args.path);
      if (!fs.statSync(target).isFile()) throw new Error('Il percorso deve indicare un file.');
      if (SENSITIVE_FILE_NAME.test(path.basename(target))) throw new Error('Il file contiene materiale riservato e non può entrare nel contesto AI.');
      if (fs.statSync(target).size > 2 * 1024 * 1024) throw new Error('Il file è troppo grande per la lettura contestuale.');
      return { path: target };
    }
    if (tool === 'write_file') {
      const content = String(args.content ?? '');
      if (content.length > 500_000 || content.includes('\0')) throw new Error('Il contenuto del file non è valido o supera 500.000 caratteri.');
      return { path: resolveWritableInsideRoot(this.vaultPath, args.path), content };
    }
    if (tool === 'write_files') {
      if (!Array.isArray(args.files) || !args.files.length || args.files.length > 20) throw new Error('Il progetto deve contenere da 1 a 20 file.');
      let total = 0;
      const seen = new Set();
      const files = args.files.map((file) => {
        const target = resolveWritableInsideRoot(this.vaultPath, file?.path);
        const content = String(file?.content ?? '');
        total += content.length;
        if (content.includes('\0') || content.length > 500_000 || seen.has(target)) throw new Error('Un file del progetto non è valido o è duplicato.');
        seen.add(target);
        return { path: target, content };
      });
      if (total > 1_000_000) throw new Error('Il progetto supera il limite di contenuto per una singola attività.');
      return { files };
    }
    if (tool === 'create_directory') return { path: resolveWritableInsideRoot(this.vaultPath, args.path) };
    if (tool === 'copy_path' || tool === 'move_path') {
      const source = resolveInsideRoot(this.vaultPath, args.source);
      const destination = resolveWritableInsideRoot(this.vaultPath, args.destination);
      if (destination === source || isInside(source, destination)) throw new Error('La destinazione non può trovarsi dentro la sorgente.');
      return { source, destination };
    }
    if (tool === 'trash_path') return { path: resolveInsideRoot(this.vaultPath, args.path) };
    throw new Error(`Strumento sconosciuto: ${tool}.`);
  }

  preview(tool, args) {
    if (tool === 'open_application') return `Apri applicazione: ${args.application}`;
    const relative = (value) => path.relative(this.vaultPath, value) || '.';
    if (tool === 'open_path') return `Apri percorso nella vault: ${relative(args.path)}`;
    if (tool === 'open_user_path') return `Apri percorso personale: ${path.relative(this.userPath, args.path) || '.'}`;
    if (tool === 'run_script') return `Esegui script: ${relative(args.path)}\nArgomenti: ${args.args.join(' ') || '(nessuno)'}\nCartella: ${relative(args.cwd)}`;
    if (tool === 'list_directory') return `Esamina cartella: ${relative(args.path)}`;
    if (tool === 'read_file') return `Leggi file: ${relative(args.path)}`;
    if (tool === 'write_file') {
      const before = fs.existsSync(args.path) ? fs.readFileSync(args.path, 'utf8') : '';
      const diff = textDiffPreview(before, args.content);
      return `${fs.existsSync(args.path) ? 'Modifica' : 'Crea'} file: ${relative(args.path)}\n${diff.added} righe aggiunte · ${diff.removed} rimosse${diff.excerpt ? `\n\n${diff.excerpt}` : ''}`;
    }
    if (tool === 'write_files') return `Crea o aggiorna ${args.files.length} file:\n${args.files.map((file) => `• ${relative(file.path)}`).join('\n')}`;
    if (tool === 'create_directory') return `Crea cartella: ${relative(args.path)}`;
    if (tool === 'copy_path') return `Copia: ${relative(args.source)} → ${relative(args.destination)}`;
    if (tool === 'move_path') return `Sposta o rinomina: ${relative(args.source)} → ${relative(args.destination)}`;
    if (tool === 'trash_path') return `Sposta nel cestino: ${relative(args.path)}`;
    return `Esegui comando: ${args.command} ${args.args.join(' ')}\nCartella nella vault: ${relative(args.cwd)}`;
  }

  propose(plan, { subjectId = '', deviceIdentity = null } = {}) {
    if (!this.acceptingActions) throw new Error('NexusNXS è in fase di chiusura: nessuna nuova azione può essere pianificata.');
    for (const [id, ticket] of this.tickets) if (ticket.expiresAt < this.now()) this.tickets.delete(id);
    if (this.tickets.size >= MAX_PENDING_TICKETS) throw new Error('Troppe proposte operative in attesa. Completa o lascia scadere quelle esistenti.');
    const definition = TOOL_DEFINITIONS.find((item) => item.name === plan.tool);
    if (!definition) throw new Error(`Strumento non disponibile: ${plan.tool}.`);
    const args = this.validate(plan.tool, plan.arguments);
    const effect = TOOL_EFFECTS[plan.tool] || { effect: 'unknown', rollback: 'not-guaranteed' };
    const workspaceId = workspaceFingerprint(this.vaultPath);
    const subject = actionSubjectBinding({ subjectId, deviceIdentity });
    const ticket = {
      id: randomUUID(),
      tool: plan.tool,
      args,
      summary: asText(plan.summary, 'La sintesi', 1000),
      reason: String(plan.reason || '').slice(0, 1000),
      risk: definition.risk,
      preview: this.preview(plan.tool, args),
      workspaceId,
      subjectId: subject.subjectId,
      subjectKind: subject.subjectKind,
      keyFingerprint: subject.keyFingerprint,
      identityBound: subject.identityBound,
      capability: {
        scope: 'active-workspace', workspaceId, tool: plan.tool,
        effect: effect.effect, rollback: effect.rollback,
        subjectBound: Boolean(subject.subjectId), identityBound: subject.identityBound, singleUse: true
      },
      phase: 'dry-run',
      createdAt: this.now(),
      expiresAt: this.now() + TICKET_TTL_MS
    };
    this.tickets.set(ticket.id, ticket);
    return { ...ticket, args: { ...ticket.args } };
  }

  audit(event) {
    fs.mkdirSync(path.dirname(this.auditPath), { recursive: true });
    fs.appendFileSync(this.auditPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...sanitizeAuditEvent(event) })}\n`, { encoding: 'utf8', mode: 0o600 });
    const clean = sanitizeAuditEvent(event);
    this.securityEventStore?.append?.(`action.${clean.event || 'event'}`, {
      severity: ['failed', 'capability-denied', 'rollback-failed'].includes(clean.event) ? 'critical'
        : ['denied', 'cancelled', 'rolled-back'].includes(clean.event) ? 'warning' : 'info',
      detail: [clean.tool, clean.verification].filter(Boolean).join(':')
    });
  }

  recordReceipt(ticket, {
    outcome,
    verification = '',
    rollbackStatus = 'not-requested',
    transactionId = '',
    checkpointCount = 0,
    artifacts = []
  } = {}) {
    const receipt = createActionReceipt({
      actionId: ticket.id,
      outcome,
      tool: ticket.tool,
      effect: ticket.capability?.effect || TOOL_EFFECTS[ticket.tool]?.effect,
      verification,
      workspaceId: ticket.workspaceId,
      subjectId: ticket.subjectId,
      subjectKind: ticket.subjectKind,
      keyFingerprint: ticket.keyFingerprint,
      rollbackPolicy: ticket.capability?.rollback || TOOL_EFFECTS[ticket.tool]?.rollback,
      rollbackStatus,
      transactionId,
      checkpointCount,
      artifactKinds: artifacts.map((artifact) => artifact?.kind).filter(Boolean),
      startedAt: ticket.createdAt,
      completedAt: this.now()
    }, { signer: this.receiptSigner });
    let persisted = true;
    try {
      fs.mkdirSync(path.dirname(this.receiptPath), { recursive: true });
      fs.appendFileSync(this.receiptPath, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      persisted = false;
      this.audit({ event: 'receipt-failed', tool: ticket.tool, error: error.message });
      this.logger?.warn?.('Ricevuta azione non persistita.', { tool: ticket.tool, error });
    }
    return { receipt, persisted };
  }

  history({ limit = 80 } = {}) {
    if (!fs.existsSync(this.auditPath)) return [];
    try {
      if (fs.statSync(this.auditPath).size > 4 * 1024 * 1024) return [];
      return fs.readFileSync(this.auditPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit)
        .map((line) => {
          try {
            const item = JSON.parse(line);
            return {
              timestamp: String(item.timestamp || ''),
              event: String(item.event || ''),
              tool: String(item.tool || ''),
              ...(item.preview ? { preview: String(item.preview).slice(0, 500) } : {}),
              ...(Number.isFinite(item.code) || item.code === null ? { code: item.code } : {})
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    } catch {
      return [];
    }
  }

  checkpointManifest() {
    return path.join(this.checkpointDirectory, 'writes.jsonl');
  }

  appendCheckpointRecord(record) {
    fs.mkdirSync(this.checkpointDirectory, { recursive: true });
    fs.appendFileSync(this.checkpointManifest(), `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  createWriteCheckpoint(target, transactionId = '', expectedContent = '') {
    fs.mkdirSync(this.checkpointDirectory, { recursive: true });
    const id = randomUUID();
    const existed = fs.existsSync(target);
    const relativePath = path.relative(this.vaultPath, target);
    const backupPath = path.join(this.checkpointDirectory, `${id}.bak`);
    const beforeHash = existed ? fileFingerprint(target) : '';
    if (existed) {
      fs.copyFileSync(target, backupPath);
      if (fileFingerprint(backupPath) !== beforeHash) throw new Error('Il punto di ripristino non ha superato la verifica iniziale.');
    }
    const metadata = {
      version: 2,
      phase: 'prepared',
      id,
      relativePath,
      existed,
      beforeHash,
      afterHash: contentFingerprint(String(expectedContent)),
      createdAt: this.now(),
      workspaceId: workspaceFingerprint(this.vaultPath),
      transactionId: checkpointTransactionKey(transactionId || id)
    };
    this.appendCheckpointRecord(metadata);
    return metadata;
  }

  commitWriteCheckpoint(checkpoint, target) {
    if (!checkpoint || checkpoint.workspaceId !== workspaceFingerprint(this.vaultPath)) {
      throw Object.assign(new Error('Il checkpoint non appartiene allo spazio di lavoro attivo.'), { code: 'CHECKPOINT_WORKSPACE_MISMATCH' });
    }
    const persistedHash = fileFingerprint(target);
    if (persistedHash !== checkpoint.afterHash) {
      throw Object.assign(new Error('Lo stato scritto non corrisponde al checkpoint preparato.'), { code: 'CHECKPOINT_COMMIT_MISMATCH' });
    }
    this.appendCheckpointRecord({
      version: 2,
      phase: 'committed',
      id: checkpoint.id,
      workspaceId: checkpoint.workspaceId,
      afterHash: persistedHash,
      committedAt: this.now()
    });
    return { ...checkpoint, phase: 'committed', committedAt: this.now() };
  }

  checkpointStates() {
    const manifest = this.checkpointManifest();
    if (!fs.existsSync(manifest) || fs.statSync(manifest).size > 16 * 1024 * 1024) return [];
    const states = new Map();
    for (const line of fs.readFileSync(manifest, 'utf8').split(/\r?\n/).filter(Boolean)) {
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      if (record?.version !== 2 || !/^[a-f0-9-]{36}$/i.test(String(record.id || ''))) continue;
      if (record.phase === 'prepared') {
        if (!/^[a-f0-9]{64}$/.test(String(record.workspaceId || ''))
          || !/^[a-f0-9]{64}$/.test(String(record.afterHash || ''))
          || (record.existed && !/^[a-f0-9]{64}$/.test(String(record.beforeHash || '')))
          || typeof record.relativePath !== 'string') continue;
        states.set(record.id, { ...record, committed: false, restored: false });
        continue;
      }
      const current = states.get(record.id);
      if (!current || record.workspaceId !== current.workspaceId) continue;
      if (record.phase === 'committed' && record.afterHash === current.afterHash) {
        current.committed = true;
        current.committedAt = record.committedAt;
      } else if (record.phase === 'restored') {
        current.restored = true;
        current.restoredAt = record.restoredAt;
      }
    }
    return [...states.values()];
  }

  preflightCheckpoint(checkpoint, { allowPrepared = false } = {}) {
    const currentWorkspace = workspaceFingerprint(this.vaultPath);
    if (!checkpoint || checkpoint.workspaceId !== currentWorkspace || checkpoint.restored || (!checkpoint.committed && !allowPrepared)) {
      throw Object.assign(new Error('Il checkpoint non e valido per questo spazio di lavoro.'), { code: 'CHECKPOINT_INVALID' });
    }
    const target = resolveWritableInsideRoot(this.vaultPath, checkpoint.relativePath);
    const targetExists = fs.existsSync(target);
    const currentHash = targetExists ? fileFingerprint(target) : '';
    if (allowPrepared && !checkpoint.committed) {
      const unchanged = checkpoint.existed
        ? targetExists && currentHash === checkpoint.beforeHash
        : !targetExists;
      if (unchanged) return { checkpoint, target, backupPath: '', unchanged: true };
    }
    if (!targetExists || currentHash !== checkpoint.afterHash) {
      throw Object.assign(new Error('Il file e cambiato dopo l’azione: rollback interrotto per non sovrascrivere modifiche successive.'), { code: 'ROLLBACK_STATE_MISMATCH' });
    }
    const backupPath = path.join(this.checkpointDirectory, `${checkpoint.id}.bak`);
    if (checkpoint.existed && (!fs.existsSync(backupPath) || fileFingerprint(backupPath) !== checkpoint.beforeHash)) {
      throw Object.assign(new Error('Il punto di ripristino e mancante o non integro.'), { code: 'ROLLBACK_CHECKPOINT_TAMPERED' });
    }
    return { checkpoint, target, backupPath };
  }

  restoreCheckpoint(preflight) {
    const { checkpoint, target, backupPath, unchanged = false } = preflight;
    if (unchanged) {
      this.appendCheckpointRecord({
        version: 2,
        phase: 'restored',
        id: checkpoint.id,
        workspaceId: checkpoint.workspaceId,
        restoredAt: this.now(),
        outcome: 'no-change'
      });
      return null;
    }
    if (checkpoint.existed) {
      fs.copyFileSync(backupPath, target);
      if (fileFingerprint(target) !== checkpoint.beforeHash) throw new Error('Il contenuto ripristinato non ha superato la verifica.');
    } else {
      fs.rmSync(target, { force: true });
      if (fs.existsSync(target)) throw new Error('Il file creato non e stato rimosso durante il rollback.');
    }
    this.appendCheckpointRecord({
      version: 2,
      phase: 'restored',
      id: checkpoint.id,
      workspaceId: checkpoint.workspaceId,
      restoredAt: this.now()
    });
    return checkpoint.relativePath;
  }

  rollbackReceipt({ actionId, transactionId, checkpointCount, status }) {
    return this.recordReceipt({
      id: `rollback-${contentFingerprint(String(actionId || ''))}`,
      tool: 'rollback',
      workspaceId: workspaceFingerprint(this.vaultPath),
      subjectId: '',
      subjectKind: 'local',
      keyFingerprint: '',
      createdAt: this.now(),
      capability: { effect: 'rollback', rollback: 'not-required' }
    }, {
      outcome: status === 'restored' ? 'completed' : status,
      verification: status,
      rollbackStatus: status,
      transactionId,
      checkpointCount
    });
  }

  undoLastWrite() {
    const checkpoint = this.checkpointStates()
      .filter((item) => item.workspaceId === workspaceFingerprint(this.vaultPath) && item.committed && !item.restored)
      .at(-1);
    if (!checkpoint) return { status: 'empty', message: 'Non ci sono modifiche recenti da annullare.' };
    try {
      const restoredPath = this.restoreCheckpoint(this.preflightCheckpoint(checkpoint));
      this.audit({ event: 'restored', tool: 'write_file', verification: 'hash-verified' });
      const recorded = this.rollbackReceipt({ actionId: checkpoint.id, transactionId: checkpoint.transactionId, checkpointCount: 1, status: 'restored' });
      return { status: 'restored', message: 'Ultima modifica ai file annullata.', path: restoredPath, receipt: recorded.receipt, receiptPersisted: recorded.persisted };
    } catch (error) {
      const recorded = this.rollbackReceipt({ actionId: checkpoint.id, transactionId: checkpoint.transactionId, checkpointCount: 1, status: 'failed' });
      error.receipt = recorded.receipt;
      throw error;
    }
  }

  undoTransaction(transactionId, { allowPrepared = false } = {}) {
    const safeId = asText(transactionId, 'L’attivita', 128);
    const transactionKey = checkpointTransactionKey(safeId);
    const checkpoints = this.checkpointStates()
      .filter((item) => item.transactionId === transactionKey
        && item.workspaceId === workspaceFingerprint(this.vaultPath)
        && !item.restored
        && (item.committed || allowPrepared))
      .reverse();
    if (!checkpoints.length) return { status: 'empty', message: 'Non ci sono modifiche da annullare per questa attivita.', paths: [] };
    let preflight;
    try {
      // Prima valida l’intera transazione; nessun file viene toccato se un solo
      // checkpoint non coincide con lo stato atteso.
      preflight = checkpoints.map((checkpoint) => this.preflightCheckpoint(checkpoint, { allowPrepared }));
    } catch (error) {
      const recorded = this.rollbackReceipt({ actionId: safeId, transactionId: safeId, checkpointCount: checkpoints.length, status: 'failed' });
      error.receipt = recorded.receipt;
      throw error;
    }
    let paths;
    try {
      paths = preflight.map((item) => this.restoreCheckpoint(item)).filter(Boolean);
    } catch (error) {
      this.audit({ event: 'rollback-failed', tool: 'write_file', error: error.message });
      const recorded = this.rollbackReceipt({ actionId: safeId, transactionId: safeId, checkpointCount: checkpoints.length, status: 'failed' });
      error.receipt = recorded.receipt;
      throw error;
    }
    this.audit({ event: 'transaction-restored', tool: 'write_file', verification: 'hash-verified' });
    const recorded = this.rollbackReceipt({ actionId: safeId, transactionId: safeId, checkpointCount: checkpoints.length, status: 'restored' });
    return {
      status: 'restored',
      message: `${paths.length} ${paths.length === 1 ? 'file ripristinato' : 'file ripristinati'}.`,
      paths,
      receipt: recorded.receipt,
      receiptPersisted: recorded.persisted
    };
  }

  async execute(ticketId, { approved = false, approvalMode = 'always', onOutput, transactionId = '', subjectId = '', deviceIdentity = null, requireSubject = false, requireVerifiedIdentity = false, signal } = {}) {
    if (!this.acceptingActions) throw new Error('NexusNXS è in fase di chiusura: nessuna nuova azione può essere avviata.');
    const canonicalTicketId = asText(ticketId, 'Il ticket', 128);
    const ticket = this.tickets.get(canonicalTicketId);
    // Consuma sempre la stessa chiave canonica usata per la lookup. Un valore
    // equivalente ma non canonico (spazi, String object) non deve lasciare una
    // capability riutilizzabile nella mappa.
    this.tickets.delete(canonicalTicketId);
    if (!ticket || ticket.expiresAt < this.now()) throw new Error('La proposta è scaduta o non è valida. Pianifica nuovamente l’azione.');
    const caller = actionSubjectBinding({ subjectId, deviceIdentity });
    if (requireSubject && (!ticket.subjectId || !caller.subjectId)) {
      this.audit({ event: 'capability-denied', tool: ticket.tool, preview: ticket.preview });
      throw Object.assign(new Error('La proposta non appartiene a una sessione remota autenticata.'), { code: 'CAPABILITY_SUBJECT_REQUIRED' });
    }
    if (requireVerifiedIdentity && (!ticket.identityBound || !caller.identityBound)) {
      this.audit({ event: 'capability-denied', tool: ticket.tool, verification: 'verified-device-required' });
      throw Object.assign(new Error('L’azione remota richiede una prova firmata del dispositivo.'), { code: 'CAPABILITY_DEVICE_IDENTITY_REQUIRED' });
    }
    if (ticket.identityBound && !caller.identityBound) {
      this.audit({ event: 'capability-denied', tool: ticket.tool, verification: 'verified-device-missing' });
      throw Object.assign(new Error('La proposta e legata a un dispositivo verificato.'), { code: 'CAPABILITY_DEVICE_IDENTITY_REQUIRED' });
    }
    if (ticket.subjectId && (ticket.subjectId !== caller.subjectId || ticket.keyFingerprint !== caller.keyFingerprint)) {
      this.audit({ event: 'capability-denied', tool: ticket.tool, preview: ticket.preview });
      throw Object.assign(new Error('La proposta appartiene a un altro dispositivo o contesto operativo.'), { code: 'CAPABILITY_SUBJECT_MISMATCH' });
    }
    if (ticket.workspaceId !== workspaceFingerprint(this.vaultPath)) {
      this.audit({ event: 'capability-denied', tool: ticket.tool, preview: ticket.preview });
      throw Object.assign(new Error('Lo spazio di lavoro è cambiato: pianifica nuovamente l’azione.'), { code: 'CAPABILITY_WORKSPACE_MISMATCH' });
    }
    // Il filesystem può cambiare tra proposta e consenso. Ricalcola i realpath
    // al momento dell'esecuzione per impedire sostituzioni via symlink/junction.
    ticket.args = this.validate(ticket.tool, ticket.args);
    const policy = ['always', 'dangerous-only', 'full-access'].includes(approvalMode) ? approvalMode : 'always';
    const requiresApproval = ticket.risk === 'critical'
      || policy === 'always'
      || (policy === 'dangerous-only' && ticket.risk === 'high');
    if (requiresApproval && approved !== true) {
      this.audit({ event: 'denied', tool: ticket.tool, preview: ticket.preview });
      const recorded = this.recordReceipt(ticket, { outcome: 'denied', verification: 'human-denied' });
      return { status: 'denied', message: 'Azione annullata dalla persona.', receipt: recorded.receipt, receiptPersisted: recorded.persisted };
    }
    this.audit({ event: requiresApproval ? 'approved' : 'auto-approved', tool: ticket.tool, preview: ticket.preview, approvalMode: policy });
    const rollbackPolicy = ticket.capability?.rollback || TOOL_EFFECTS[ticket.tool]?.rollback || 'not-guaranteed';
    const rollbackTransactionId = String(transactionId || ticket.id).slice(0, 128);
    try {
      assertActionNotAborted(signal);
      const before = ticket.tool === 'write_file' && fs.existsSync(ticket.args.path)
        ? fs.readFileSync(ticket.args.path, 'utf8')
        : '';
      const result = await this.perform(ticket, { onOutput, transactionId: rollbackTransactionId, signal });
      const artifact = compactArtifact(ticket, result, this.vaultPath, before);
      const artifacts = Array.isArray(result.artifacts) ? result.artifacts : artifact ? [artifact] : [];
      this.audit({ event: 'completed', tool: ticket.tool, code: result.code ?? null, verification: result.verification || 'accepted' });
      const recorded = this.recordReceipt(ticket, {
        outcome: 'completed',
        verification: result.verification || 'accepted',
        rollbackStatus: result.canUndo ? 'available' : 'not-required',
        transactionId: rollbackTransactionId,
        checkpointCount: result.checkpointCount || 0,
        artifacts
      });
      return {
        status: 'completed', ...result,
        capability: { ...ticket.capability, consumed: true },
        ...(artifacts.length ? { artifacts } : {}),
        receipt: recorded.receipt,
        receiptPersisted: recorded.persisted
      };
    } catch (error) {
      const cancelled = error?.code === 'ACTION_CANCELLED' || error?.name === 'AbortError';
      let rollback = null;
      if (rollbackPolicy === 'automatic') {
        try {
          rollback = this.undoTransaction(rollbackTransactionId, { allowPrepared: true });
          if (rollback.status === 'restored') this.audit({ event: 'rolled-back', tool: ticket.tool, verification: rollback.status });
        } catch (rollbackError) {
          this.audit({ event: 'rollback-failed', tool: ticket.tool, error: rollbackError.message });
          error.rollbackError = rollbackError.message;
        }
      }
      this.audit({ event: cancelled ? 'cancelled' : 'failed', tool: ticket.tool, error: error.message });
      if (rollback) error.rollback = rollback;
      const recorded = this.recordReceipt(ticket, {
        outcome: cancelled ? 'cancelled' : 'failed',
        verification: cancelled ? 'cancelled' : 'failed',
        rollbackStatus: rollback?.status || (rollbackPolicy === 'automatic' ? 'failed' : 'not-requested'),
        transactionId: rollbackTransactionId,
        checkpointCount: rollback?.paths?.length || 0
      });
      error.actionReceipt = recorded.receipt;
      if (cancelled) this.logger?.info?.('Azione NEXUSNXS annullata.', { tool: ticket.tool });
      else this.logger?.warn('Azione NEXUSNXS fallita.', { tool: ticket.tool, error });
      throw error;
    }
  }

  async perform(ticket, { onOutput, transactionId = '', signal } = {}) {
    assertActionNotAborted(signal);
    if (ticket.tool === 'open_path' || ticket.tool === 'open_user_path') {
      const error = await this.shell.openPath(ticket.args.path);
      if (error) throw new Error(error);
      return { message: 'Richiesta di apertura del percorso accettata dal sistema.', verification: 'os-accepted' };
    }
    if (ticket.tool === 'open_application') {
      const application = (APPLICATIONS[this.platform] || APPLICATIONS.linux)[ticket.args.application];
      if (application.uri) {
        await this.shell.openExternal(application.uri);
        return { message: `Richiesta di apertura di ${application.label} accettata dal sistema.`, verification: 'os-accepted' };
      }
      try {
        const commands = application.commands || [application.command];
        let lastError;
        for (const command of commands) {
          if (!command || (path.isAbsolute(command) && !fs.existsSync(command))) continue;
          try {
            await launchDetached(command, application.args || []);
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (lastError || !commands.some((command) => command && (!path.isAbsolute(command) || fs.existsSync(command)))) {
          throw lastError || new Error(`${application.label} non è installata.`);
        }
      } catch (error) {
        if (!application.fallback) throw error;
        await launchDetached(application.fallback, []);
      }
      return { message: `Avvio di ${application.label} accettato dal sistema.`, verification: 'process-started' };
    }
    if (ticket.tool === 'run_script') {
      const interpreter = interpreterFor(ticket.args.path);
      const result = await runProcess(interpreter.command, [...interpreter.prefix, ticket.args.path, ...ticket.args.args], { cwd: ticket.args.cwd, onOutput, processRegistry: this.activeProcesses, platform: this.platform, signal });
      return { ...result, message: `Script terminato con codice ${result.code}.`, verification: result.code === 0 ? 'exit-code-zero' : 'exit-code-failure' };
    }
    if (ticket.tool === 'list_directory') {
      const entries = fs.readdirSync(ticket.args.path, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.') && !SENSITIVE_FILE_NAME.test(entry.name))
        .slice(0, 500)
        .map((entry) => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}`);
      return { message: `Cartella esaminata: ${entries.length} elementi.`, stdout: entries.join('\n'), verification: 'read-complete' };
    }
    if (ticket.tool === 'read_file') {
      return { message: 'File letto.', stdout: fs.readFileSync(ticket.args.path, 'utf8'), verification: 'read-complete' };
    }
    if (ticket.tool === 'write_file') {
      const existed = fs.existsSync(ticket.args.path);
      const checkpoint = this.createWriteCheckpoint(ticket.args.path, transactionId, ticket.args.content);
      const temporary = `${ticket.args.path}.${process.pid}.nexus-tmp`;
      fs.writeFileSync(temporary, ticket.args.content, { encoding: 'utf8', mode: 0o600 });
      fs.copyFileSync(temporary, ticket.args.path);
      fs.rmSync(temporary, { force: true });
      const persisted = fs.readFileSync(ticket.args.path, 'utf8');
      if (persisted !== ticket.args.content) throw new Error('La verifica della scrittura non corrisponde al contenuto preparato.');
      this.commitWriteCheckpoint(checkpoint, ticket.args.path);
      let validation = 'content-match';
      if (path.extname(ticket.args.path).toLowerCase() === '.json') {
        JSON.parse(persisted);
        validation = 'json-valid';
      }
      return { message: existed ? 'File modificato. Puoi annullare questa modifica dalla chat.' : 'File creato. Puoi annullare questa modifica dalla chat.', verification: 'write-complete', validation, canUndo: true, checkpointCount: 1 };
    }
    if (ticket.tool === 'write_files') {
      const operationId = transactionId || ticket.id;
      const artifacts = [];
      for (const file of ticket.args.files) {
        const existed = fs.existsSync(file.path);
        const before = existed ? fs.readFileSync(file.path, 'utf8') : '';
        const checkpoint = this.createWriteCheckpoint(file.path, operationId, file.content);
        fs.mkdirSync(path.dirname(file.path), { recursive: true });
        const temporary = `${file.path}.${process.pid}.nexus-tmp`;
        fs.writeFileSync(temporary, file.content, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temporary, file.path);
        const persisted = fs.readFileSync(file.path, 'utf8');
        if (persisted !== file.content) throw new Error('Un file del progetto non ha superato la verifica.');
        this.commitWriteCheckpoint(checkpoint, file.path);
        if (path.extname(file.path).toLowerCase() === '.json') JSON.parse(persisted);
        const preview = textDiffPreview(before, persisted);
        artifacts.push({
          id: `${ticket.id}-${artifacts.length}`, kind: 'file-change', title: path.relative(this.vaultPath, file.path),
          subtitle: existed ? 'Modificato' : 'Creato', language: artifactLanguage(file.path), content: persisted.slice(0, ARTIFACT_CONTENT_LIMIT),
          previousContent: before.slice(0, ARTIFACT_CONTENT_LIMIT), diff: preview.excerpt.slice(0, ARTIFACT_CONTENT_LIMIT),
          added: preview.added, removed: preview.removed, events: [{ label: 'Contenuto preparato', status: 'complete' }, { label: 'Scrittura verificata', status: 'complete' }]
        });
      }
      return { message: `${artifacts.length} file creati o aggiornati e verificati. Puoi annullare l’intera attività.`, verification: 'project-written', canUndo: true, checkpointCount: artifacts.length, artifacts };
    }
    if (ticket.tool === 'create_directory') {
      fs.mkdirSync(ticket.args.path, { recursive: true });
      if (!fs.statSync(ticket.args.path).isDirectory()) throw new Error('La cartella non è stata creata correttamente.');
      return { message: 'Cartella creata e verificata.', verification: 'directory-created' };
    }
    if (ticket.tool === 'copy_path') {
      fs.mkdirSync(path.dirname(ticket.args.destination), { recursive: true });
      fs.cpSync(ticket.args.source, ticket.args.destination, { recursive: true, errorOnExist: true, force: false });
      if (!fs.existsSync(ticket.args.destination)) throw new Error('La copia non è stata verificata.');
      return { message: 'Elemento copiato e verificato.', verification: 'copy-complete' };
    }
    if (ticket.tool === 'move_path') {
      fs.mkdirSync(path.dirname(ticket.args.destination), { recursive: true });
      fs.renameSync(ticket.args.source, ticket.args.destination);
      if (fs.existsSync(ticket.args.source) || !fs.existsSync(ticket.args.destination)) throw new Error('Lo spostamento non è stato verificato.');
      return { message: 'Elemento spostato e verificato.', verification: 'move-complete' };
    }
    if (ticket.tool === 'trash_path') {
      if (typeof this.shell.trashItem !== 'function') throw new Error('Il cestino non è disponibile su questo sistema.');
      await this.shell.trashItem(ticket.args.path);
      if (fs.existsSync(ticket.args.path)) throw new Error('L’elemento non è stato spostato nel cestino.');
      return { message: 'Elemento spostato nel cestino.', verification: 'trashed' };
    }
    const result = await runProcess(ticket.args.command, ticket.args.args, { cwd: ticket.args.cwd, onOutput, processRegistry: this.activeProcesses, platform: this.platform, signal });
    return { ...result, message: `Comando terminato con codice ${result.code}.`, verification: result.code === 0 ? 'exit-code-zero' : 'exit-code-failure' };
  }
}

module.exports = { ActionRuntime, TOOL_DEFINITIONS, TOOL_EFFECTS, actionCancelledError, outputDiagnostics, parseAgentPlan, resolveInsideRoot, sanitizeAuditEvent, sanitizedChildEnvironment, terminateOwnedProcessTree, textDiffPreview, validateCommandArguments, workspaceFingerprint };

// #endregion
