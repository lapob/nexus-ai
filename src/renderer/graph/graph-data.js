export const graphNodes = Object.freeze([
  { id: 'core', label: 'NEXUS CORE', category: 'Cognitive system', importance: 1, x: .44, y: .48, depth: .96, description: 'Centro operativo della conoscenza e delle capacità locali.' },
  { id: 'memory', label: 'MEMORY', category: 'Future capability', importance: .82, x: .34, y: .19, depth: .76, description: 'Memoria persistente non ancora disponibile.', available: false },
  { id: 'vault', label: 'VAULT', category: 'Knowledge source', importance: .88, x: .17, y: .36, depth: .82, description: 'Note Markdown, proprietà e collegamenti della vault.', path: '00_Home/Nexus Dashboard.md' },
  { id: 'agents', label: 'AGENTS', category: 'Future capability', importance: .82, x: .58, y: .19, depth: .7, description: 'Orchestrazione agentica non ancora disponibile.', available: false },
  { id: 'projects', label: 'PROJECTS', category: 'Workspace', importance: .74, x: .72, y: .35, depth: .8, description: 'Obiettivi e documentazione dei progetti.', path: '04_Progetti/Progetti Attivi.md' },
  { id: 'research', label: 'RESEARCH', category: 'Knowledge domain', importance: .68, x: .1, y: .59, depth: .56, description: 'Fonti, idee e connessioni emergenti.', path: '05_Risorse/MOC - Risorse.md' },
  { id: 'university', label: 'UNIVERSITY', category: 'Learning', importance: .68, x: .33, y: .8, depth: .64, description: 'Percorsi formativi e progressione personale.', path: '00_Home/Curriculum completo.md' },
  { id: 'cybersecurity', label: 'CYBERSECURITY', category: 'Knowledge domain', importance: .78, x: .16, y: .73, depth: .72, description: 'Fondamenti, blue team, ethical hacking e laboratori.', path: '02_Cybersecurity/MOC - Cybersecurity.md' },
  { id: 'models', label: 'MODELS', category: 'Local inference', importance: .72, x: .62, y: .8, depth: .68, description: 'Configurazione dei modelli locali.', path: '06_AI_Assistant/Modelli Locali.md' },
  { id: 'labs', label: 'LABS', category: 'Cyber range', importance: .62, x: .76, y: .65, depth: .52, description: 'Esercitazioni e prove riproducibili.', path: '02_Cybersecurity/Labs/MOC - Labs.md' }
]);

export const graphEdges = Object.freeze(graphNodes.slice(1).map((node) => Object.freeze(['core', node.id])));
export const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
