/**
 * @module tests/web-store-projects
 * @description Stato locale della web app: progetti (contesto, assegnazione, eliminazione), rami, fissate, rinomina, pannello laterale.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Ambiente browser minimo: lo store legge e scrive localStorage al caricamento e con un timer.
const memory = new Map();
globalThis.window = {
  localStorage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) },
  setTimeout: (callback) => { callback(); return 0; }, clearTimeout: () => {}
};
memory.set('nxs.next.state.v1', JSON.stringify({
  conversations: [], pinned: [], projectView: 'ghost',
  projects: [{ id: 'p-old', name: 'Salvato', instructions: 'x', files: [{ id: 'f', name: 'a.md', size: 1, text: 'ciao' }, { broken: true }] }, { nope: 1 }],
  projectOf: { c1: 'p-old', c2: 'missing', c3: 42 }
}));

const load = (name) => import(pathToFileURL(path.join(__dirname, '..', 'web', 'src', name)).href);

test('al caricamento i progetti salvati vengono ripuliti: niente riferimenti orfani', async () => {
  const { getState } = await load('store.ts');
  const state = getState();
  assert.deepEqual(state.projects.map((project) => project.id), ['p-old']);
  assert.equal(state.projects[0].files.length, 1, 'file malformati scartati');
  assert.deepEqual(state.projectOf, { c1: 'p-old' });
  assert.equal(state.projectView, null, 'una vista su un progetto inesistente non sopravvive');
});

test('progetti: le chat nuove e i rami ereditano il progetto; eliminarlo non elimina le chat', async () => {
  const store = await load('store.ts');
  const project = store.createProject('  Tesi  ');
  assert.equal(store.getState().projectView, project);
  assert.equal(store.getState().projects[0].name, 'Tesi');
  const chat = store.newConversation();
  assert.equal(store.projectFor(chat)?.id, project);
  store.appendMessage(chat, { id: 'u1', role: 'user', content: 'Prima domanda', createdAt: 1 });
  store.appendMessage(chat, { id: 'a1', role: 'assistant', content: 'Risposta', createdAt: 2 });
  const branch = store.forkConversation(chat, 'u1');
  assert.equal(store.projectFor(branch)?.id, project, 'il ramo resta nel progetto');
  assert.equal(store.getState().conversations.find((item) => item.id === branch).messages.length, 1);
  store.openProject(null);
  const outside = store.newConversation();
  assert.equal(store.projectFor(outside), null);
  store.assignProject(outside, project);
  assert.equal(store.projectFor(outside)?.id, project);
  store.assignProject(outside, null);
  assert.equal(store.projectFor(outside), null);
  store.deleteConversation(branch);
  assert.equal(branch in store.getState().projectOf, false);
  store.deleteProject(project);
  assert.equal(store.getState().conversations.some((item) => item.id === chat), true, 'la chat resta nella cronologia');
  assert.equal(store.projectFor(chat), null);
  assert.ok(memory.get('nxs.next.state.v1').includes('"projects"'), 'i progetti sono persistiti in locale');
});

test('contesto del progetto: istruzioni prima, file entro il budget, gli esclusi sono nominati', async () => {
  const { projectContext } = await load('store.ts');
  const project = { id: 'p', name: 'Casa', instructions: 'Rispondi in breve.', createdAt: 0, updatedAt: 0,
    files: [{ id: '1', name: 'misure.md', size: 10, text: 'Soggiorno 5x4' }, { id: '2', name: 'enorme.txt', size: 9_000, text: 'x'.repeat(9_000) }, { id: '3', name: 'ultimo.md', size: 5, text: 'fine' }] };
  const small = projectContext(project, 1_200);
  assert.ok(small.length <= 1_200);
  assert.match(small, /^Contesto del progetto «Casa»/);
  assert.ok(small.indexOf('Rispondi in breve.') < small.indexOf('misure.md'));
  assert.match(small, /\[…file troncato\]|non inclusi per spazio/);
  const large = projectContext(project, 20_000);
  assert.match(large, /### File: ultimo\.md\nfine/);
  assert.doesNotMatch(large, /non inclusi/);
});

test('fissate e rinomina: il titolo cambia senza spostare la chat, vuoto non è ammesso', async () => {
  const store = await load('store.ts');
  const first = store.newConversation();
  assert.equal(store.newConversation(), first, '"+" ripetuto riapre la stessa chat vuota');
  const count = store.getState().conversations.length;
  store.newConversation();
  assert.equal(store.getState().conversations.length, count, 'nessuna chat vuota accumulata');
  store.appendMessage(first, { id: 'f1', role: 'user', content: 'Ciao', createdAt: 3 });
  const second = store.newConversation();
  assert.notEqual(second, first);
  const order = () => store.getState().conversations.map((item) => item.id);
  const before = order();
  store.renameConversation(first, '   Nuovo   titolo  ');
  assert.equal(store.getState().conversations.find((item) => item.id === first).title, 'Nuovo titolo');
  assert.deepEqual(order(), before);
  store.renameConversation(first, '   ');
  assert.equal(store.getState().conversations.find((item) => item.id === first).title, 'Nuovo titolo');
  store.togglePin(second);
  assert.equal(store.getState().pinned[0], second);
  store.togglePin(second);
  assert.equal(store.getState().pinned.includes(second), false);
});

test('pannello laterale: anteprime sicure, CSV con virgolette, nomi file puliti', async () => {
  const { previewKind, parseDelimited, fileName, titleFor, worthPanel } = await load('panelStore.ts');
  assert.equal(previewKind('svg', '<svg viewBox="0 0 1 1"></svg>'), 'svg');
  assert.equal(previewKind('xml', '<?xml version="1.0"?>\n<svg></svg>'), 'svg');
  assert.equal(previewKind('xml', '<note/>'), null);
  assert.equal(previewKind('markdown', '# Ciao'), 'markdown');
  assert.equal(previewKind('html', '<script>alert(1)</script>'), null, 'l’HTML non viene eseguito né mostrato in anteprima');
  assert.deepEqual(parseDelimited('a,b\n"x, y","il ""capo"""\r\n\n3,4'), [['a', 'b'], ['x, y', 'il "capo"'], ['3', '4']]);
  assert.deepEqual(parseDelimited('n\tv\n1\t2'), [['n', 'v'], ['1', '2']]);
  assert.equal(fileName({ id: '1', language: 'typescript', text: '', title: 'Utility: «date»' }), 'Utility-date.ts');
  assert.equal(fileName({ id: '1', language: '../../x', text: '', title: '' }), 'documento.txt');
  assert.equal(titleFor('markdown', 'intro\n## Piano di lavoro\n'), 'Piano di lavoro');
  assert.equal(titleFor('py', 'print(1)'), 'Python');
  assert.equal(worthPanel('ts', 'a\nb'), false);
  assert.equal(worthPanel('ts', Array(12).fill('x').join('\n')), true);
  assert.equal(worthPanel('csv', 'a,b'), true);
});
