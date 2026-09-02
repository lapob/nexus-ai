/**
 * @module scripts/generate-interaction-contracts
 * @description Genera contratti tipizzati desktop e Android dall'unica specifica degli stati NexusNXS.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// #region 01 — Lettura e validazione del contratto

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'config', 'nexus-interaction-states.json');
const checkOnly = process.argv.includes('--check');
const protocol = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const states = Object.entries(protocol.states || {});
const aliases = Object.entries(protocol.aliases || {});
const digest = createHash('sha256').update(JSON.stringify(protocol)).digest('hex').slice(0, 16);

if (!states.length || protocol.contractId !== 'nexusnxs-interaction-state') throw new Error('Contratto di interazione NexusNXS non valido.');
const constant = (value) => String(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();

// #endregion

// #region 02 — Generazione TypeScript e Java

const typeScript = `/**
 * @module renderer/types/interaction-states.generated
 * @description Generated from config/nexus-interaction-states.json · ${digest}. Do not edit.
 */
// #region 01 — Identità e stati
export const NEXUS_INTERACTION_CONTRACT_ID = ${JSON.stringify(protocol.contractId)} as const;
export const NEXUS_COSMIC_CONTINUUM_ID = ${JSON.stringify(protocol.presentation.continuum.id)} as const;
export const NEXUS_INTERACTION_STATES = ${JSON.stringify(protocol.states, null, 2)} as const;
// #endregion

// #region 02 — Alias e risoluzione
export const NEXUS_INTERACTION_ALIASES = ${JSON.stringify(protocol.aliases, null, 2)} as const;
export type NexusInteractionState = keyof typeof NEXUS_INTERACTION_STATES;
export function resolveNexusInteractionState(value: string): NexusInteractionState {
  const key = String(value || '').trim().toLowerCase();
  if (key in NEXUS_INTERACTION_STATES) return key as NexusInteractionState;
  return (NEXUS_INTERACTION_ALIASES as Record<string, NexusInteractionState>)[key] || 'idle';
}
// #endregion
`;

const javaStateRows = states.map(([name, value]) => `        map.put("${name}", new State("${name}", 0xFF${value.color.slice(1).toUpperCase()}, ${Number(value.energy).toFixed(2)}f, "${value.motion}"));`).join('\n');
const javaAliasRows = aliases.map(([name, value]) => `        aliases.put("${name}", "${value}");`).join('\n');
const javaConstants = states.map(([name, value]) => `    public static final int ${constant(name)} = 0xFF${value.color.slice(1).toUpperCase()};`).join('\n');
const java = `/** Generated from config/nexus-interaction-states.json · ${digest}. Do not edit. */
package local.nexus.motion;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

public final class NexusInteractionStates {
    public static final String CONTRACT_ID = "${protocol.contractId}";
    public static final String CONTINUUM_ID = "${protocol.presentation.continuum.id}";
${javaConstants}

    public static final class State {
        public final String id;
        public final int argb;
        public final float energy;
        public final String motion;
        State(String id, int argb, float energy, String motion) {
            this.id = id; this.argb = argb; this.energy = energy; this.motion = motion;
        }
    }

    private static final Map<String, State> STATES;
    private static final Map<String, String> ALIASES;
    static {
        Map<String, State> map = new LinkedHashMap<>();
${javaStateRows}
        STATES = Collections.unmodifiableMap(map);
        Map<String, String> aliases = new LinkedHashMap<>();
${javaAliasRows}
        ALIASES = Collections.unmodifiableMap(aliases);
    }

    private NexusInteractionStates() {}
    public static State resolve(String value) {
        String key = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        String resolved = STATES.containsKey(key) ? key : ALIASES.getOrDefault(key, "idle");
        return STATES.get(resolved);
    }
    public static Map<String, State> all() { return STATES; }
}
`;

// #endregion

// #region 03 — Scrittura atomica logica e modalità check

const outputs = new Map([
  [path.join(root, 'src', 'renderer', 'types', 'interaction-states.generated.ts'), typeScript],
  [path.join(root, 'android', 'shared-motion', 'src', 'main', 'java', 'local', 'nexus', 'motion', 'NexusInteractionStates.java'), java]
]);
let changed = 0;
for (const [target, content] of outputs) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === content) continue;
  if (checkOnly) throw new Error(`Contratto generato non aggiornato: ${path.relative(root, target)}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  changed += 1;
}
process.stdout.write(`Contratti interazione verificati: ${outputs.size}; aggiornati: ${changed}.\n`);

// #endregion
