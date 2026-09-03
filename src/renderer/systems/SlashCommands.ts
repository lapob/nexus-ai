/**
 * @module renderer/systems/SlashCommands
 * @description Palette slash locale e risoluzione deterministica dei comandi personalizzati.
 */

// #region 01 — Contratto e catalogo

export interface SlashCommand {
  name: string;
  label: string;
  description: string;
  template: string;
  custom?: boolean;
}

export interface SlashResolution {
  kind: 'prompt' | 'saved' | 'removed' | 'invalid';
  text: string;
  commands?: SlashCommand[];
}

const STORAGE_KEY = 'nexusnxs.slash-commands.v1';
const COMMAND_NAME = /^[a-z0-9][a-z0-9-]{0,23}$/;

export const BUILTIN_SLASH_COMMANDS: readonly SlashCommand[] = Object.freeze([
  { name: 'web', label: 'Ricerca web', description: 'Cerca informazioni aggiornate e cita le fonti.', template: 'Cerca sul web informazioni aggiornate e cita fonti affidabili: {testo}' },
  { name: 'ragiona', label: 'Ragionamento profondo', description: 'Analizza il problema, verifica e poi rispondi.', template: 'Analizza in modo approfondito, verifica i passaggi importanti e proponi la soluzione migliore: {testo}' },
  { name: 'immagine', label: 'Genera immagine', description: 'Crea un’immagine partendo dalla descrizione.', template: 'Genera un’immagine di alta qualità seguendo questa descrizione: {testo}' },
  { name: 'riassumi', label: 'Riassumi', description: 'Riduce il contenuto ai punti essenziali.', template: 'Riassumi in modo chiaro, fedele e ben strutturato: {testo}' },
  { name: 'traduci', label: 'Traduci', description: 'Rileva la lingua e produce una traduzione naturale.', template: 'Traduci il seguente contenuto nella lingua che indico, conservando tono e significato: {testo}' },
  { name: 'codice', label: 'Scrivi o correggi codice', description: 'Produce codice verificabile con spiegazione essenziale.', template: 'Affronta questa richiesta di programmazione. Fornisci codice completo, controlli e istruzioni d’uso: {testo}' },
  { name: 'impostazioni', label: 'Apri impostazioni', description: 'Apre le preferenze di NexusNXS.', template: 'Apri impostazioni' },
  { name: 'nuovo', label: 'Nuovo comando', description: 'Esempio: /nuovo brief = Riassumi in 5 punti {testo}', template: '' },
  { name: 'rimuovi', label: 'Rimuovi comando', description: 'Esempio: /rimuovi brief', template: '' }
]);

// #endregion
// #region 02 — Persistenza e suggerimenti

export function loadSlashCommands(storage: Pick<Storage, 'getItem'> = window.localStorage): SlashCommand[] {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SlashCommand => Boolean(
      item && COMMAND_NAME.test(String(item.name || ''))
      && typeof item.template === 'string' && item.template.trim()
      && !BUILTIN_SLASH_COMMANDS.some((command) => command.name === item.name)
    )).slice(0, 24).map((item) => ({
      name: item.name,
      label: String(item.label || item.name).slice(0, 48),
      description: String(item.description || 'Comando personale').slice(0, 120),
      template: item.template.trim().slice(0, 2000),
      custom: true
    }));
  } catch { return []; }
}

export function saveSlashCommands(commands: SlashCommand[], storage: Pick<Storage, 'setItem'> = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(commands.filter((item) => item.custom).slice(0, 24)));
}

export function slashSuggestions(value: string, custom: SlashCommand[]): SlashCommand[] {
  const match = /^\/([^\s]*)$/.exec(value.trim());
  if (!match) return [];
  const query = match[1].toLocaleLowerCase('it-IT');
  return [...custom, ...BUILTIN_SLASH_COMMANDS]
    .filter((command, index, all) => all.findIndex((item) => item.name === command.name) === index)
    .filter((command) => !query || command.name.startsWith(query) || command.label.toLocaleLowerCase('it-IT').includes(query))
    .slice(0, 7);
}

// #endregion
// #region 03 — Risoluzione deterministica

function customDefinition(input: string) {
  return /^(?:\/nuovo\s+|(?:crea|aggiungi|salva|imposta)\s+(?:il\s+)?comando\s+\/?)([a-z0-9][a-z0-9-]{0,23})\s*(?:=|:|come\s+)\s*([\s\S]+)$/i.exec(input.trim());
}

function customRemoval(input: string) {
  return /^(?:\/rimuovi\s+|(?:rimuovi|elimina|cancella)\s+(?:il\s+)?comando\s+\/?)([a-z0-9][a-z0-9-]{0,23})\s*$/i.exec(input.trim());
}

export function resolveSlashSubmission(input: string, custom: SlashCommand[]): SlashResolution {
  const raw = input.trim();
  const definition = customDefinition(raw);
  if (definition) {
    const name = definition[1].toLocaleLowerCase('it-IT');
    if (BUILTIN_SLASH_COMMANDS.some((command) => command.name === name)) {
      return { kind: 'invalid', text: `/${name} è un comando integrato e non può essere sostituito.` };
    }
    const template = definition[2].trim().slice(0, 2000);
    if (!template) return { kind: 'invalid', text: 'Scrivi anche l’istruzione del comando.' };
    const command: SlashCommand = { name, label: name, description: 'Comando personale', template, custom: true };
    return { kind: 'saved', text: `Comando /${name} salvato su questo dispositivo.`, commands: [command, ...custom.filter((item) => item.name !== name)].slice(0, 24) };
  }
  const removal = customRemoval(raw);
  if (removal) {
    const name = removal[1].toLocaleLowerCase('it-IT');
    const commands = custom.filter((item) => item.name !== name);
    return commands.length === custom.length
      ? { kind: 'invalid', text: `Il comando /${name} non esiste.` }
      : { kind: 'removed', text: `Comando /${name} rimosso.`, commands };
  }
  const invocation = /^\/([a-z0-9][a-z0-9-]{0,23})(?:\s+([\s\S]*))?$/i.exec(raw);
  if (!invocation) return { kind: 'prompt', text: raw };
  const name = invocation[1].toLocaleLowerCase('it-IT');
  const command = [...custom, ...BUILTIN_SLASH_COMMANDS].find((item) => item.name === name);
  if (!command || !command.template) return { kind: 'invalid', text: `Comando /${name} non riconosciuto. Scrivi / per vedere quelli disponibili.` };
  const argument = String(invocation[2] || '').trim();
  const text = command.template.includes('{testo}')
    ? command.template.replaceAll('{testo}', argument || 'il contenuto della richiesta precedente')
    : [command.template, argument].filter(Boolean).join(' ');
  return { kind: 'prompt', text };
}

// #endregion
