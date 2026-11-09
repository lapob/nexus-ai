/**
 * @module web/prompts
 * @description Suggerimenti dinamici della home (saluto per fascia oraria, categorie, rotazione) e comandi rapidi «/» del composer. Tutto locale: niente rete, niente dati personali.
 */
import type { IconName } from './Icon';

export interface Category { id: string; label: string; icon: IconName; prompts: string[] }

export const CATEGORIES: Category[] = [
  { id: 'write', label: 'Scrivi', icon: 'pen', prompts: [
    'Scrivi un’email cortese per spostare una riunione a giovedì',
    'Migliora questo testo rendendolo più chiaro e scorrevole: ',
    'Scrivi un post LinkedIn per annunciare un nuovo progetto',
    'Crea tre titoli accattivanti per un articolo su questo tema: ',
    'Scrivi un messaggio di auguri originale per un collega',
    'Riscrivi questo paragrafo con un tono più professionale: '
  ] },
  { id: 'learn', label: 'Impara', icon: 'book', prompts: [
    'Spiegami come funziona la fusione nucleare in modo semplice',
    'Che differenza c’è tra machine learning e deep learning?',
    'Spiegami la relatività ristretta con un esempio quotidiano',
    'Come funziona davvero l’inflazione? Fammi un esempio con i prezzi',
    'Insegnami le basi della teoria musicale in 5 punti',
    'Perché il cielo è blu? Spiegalo come a un bambino e poi come a un fisico'
  ] },
  { id: 'code', label: 'Codice', icon: 'code', prompts: [
    'Scrivi una funzione TypeScript che deduplica un array di oggetti',
    'Spiegami questo errore e come risolverlo: ',
    'Crea uno script PowerShell che rinomina i file di una cartella con la data',
    'Scrivi una query SQL per i 10 clienti con più ordini nell’ultimo mese',
    'Rivedi questo codice e suggerisci miglioramenti: ',
    'Spiegami la differenza tra async/await e Promise.then con esempi'
  ] },
  { id: 'plan', label: 'Pianifica', icon: 'calendar', prompts: [
    'Aiutami a pianificare una settimana di allenamento',
    'Organizza la mia settimana: lavoro, palestra tre volte e tempo libero',
    'Prepara un itinerario di 3 giorni a Roma con budget medio',
    'Crea un piano di studio di 4 settimane per imparare Python',
    'Pianifica una cena per 6 persone con menu e lista della spesa',
    'Dividi questo progetto in attività con priorità e scadenze: '
  ] },
  { id: 'analyze', label: 'Analizza', icon: 'chart', prompts: [
    'Quali sono le novità tecnologiche di questa settimana?',
    'Confronta pro e contro di lavorare da remoto',
    'Analizza i punti di forza e di debolezza di questa idea: ',
    'Riassumi i punti chiave di questo testo: ',
    'Quali domande dovrei fare prima di comprare un’auto usata?',
    'Confronta tre modi per risparmiare sulla bolletta della luce'
  ] }
];

/** Saluto per fascia oraria: la home cambia nel corso della giornata. */
export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Ancora sveglio?';
  if (hour < 12) return 'Buongiorno.';
  if (hour < 18) return 'Buon pomeriggio.';
  return 'Buonasera.';
}

/** Estrazione casuale senza ripetizioni (Fisher–Yates parziale). */
export function sample<T>(items: readonly T[], count: number, random = Math.random): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (pool.length && picked.length < count) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return picked;
}

/** Suggerimenti misti: uno per categoria diversa, in ordine casuale. */
export function mixedSuggestions(count = 4, random = Math.random): Array<{ text: string; icon: IconName }> {
  return sample(CATEGORIES, count, random).map((category) => ({ text: sample(category.prompts, 1, random)[0], icon: category.icon }));
}

/** Un prompt che finisce con «: » chiede di incollare il testo: va nel composer invece di partire. */
export const needsInput = (prompt: string) => /:\s$/.test(prompt);

export interface SlashCommand { command: string; label: string; icon: IconName; template: string }

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: 'riassumi', label: 'Riassumi in punti chiave', icon: 'list', template: 'Riassumi in punti chiave, con una frase di sintesi finale:\n\n' },
  { command: 'traduci', label: 'Traduci in inglese (o indica la lingua)', icon: 'translate', template: 'Traduci in inglese mantenendo tono e formattazione:\n\n' },
  { command: 'spiega', label: 'Spiega in modo semplice', icon: 'bulb', template: 'Spiegamelo in modo semplice, con un esempio concreto:\n\n' },
  { command: 'migliora', label: 'Migliora un testo', icon: 'wand', template: 'Migliora questo testo: più chiaro, scorrevole e senza errori. Mostra solo la versione finale.\n\n' },
  { command: 'codice', label: 'Scrivi o correggi codice', icon: 'code', template: 'Scrivi codice pulito e commentato per:\n\n' },
  { command: 'email', label: 'Scrivi un’email', icon: 'mail', template: 'Scrivi un’email breve e cortese per:\n\n' },
  { command: 'piano', label: 'Crea un piano passo passo', icon: 'calendar', template: 'Crea un piano passo passo, con priorità e tempi stimati, per:\n\n' },
  { command: 'confronta', label: 'Confronta pro e contro', icon: 'scale', template: 'Confronta pro e contro, poi dammi una raccomandazione motivata:\n\n' },
  { command: 'quiz', label: 'Mettimi alla prova con un quiz', icon: 'quiz', template: 'Fammi un quiz di 5 domande a risposta multipla, una alla volta, su:\n\n' },
  { command: 'web', label: 'Cerca sul web con fonti', icon: 'globe', template: 'Cerca sul web informazioni aggiornate, con fonti, su:\n\n' }
];

/** Comandi che corrispondono a «/parola» all'inizio della bozza (null se la bozza non è un comando). */
export function matchSlash(draft: string): SlashCommand[] | null {
  const match = /^\/([\p{L}-]*)$/u.exec(draft);
  if (!match) return null;
  const query = match[1].toLocaleLowerCase('it');
  // Prima il nome del comando; la descrizione solo se nessun nome corrisponde e la parola è lunga (es. «/inglese» → traduci).
  const byName = SLASH_COMMANDS.filter((item) => item.command.startsWith(query));
  return byName.length || query.length < 3 ? byName : SLASH_COMMANDS.filter((item) => item.label.toLocaleLowerCase('it').includes(query));
}
