const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTechnicalTask, conversationalGuidance, deriveSearchQueries, parsePlannerOutput, mergeSources, sourceReliability } = require('../src/application/reasoning');
const { agentPlanSchema, buildSystemPrompt, directApplicationPlan, remoteActionCapabilities } = require('../src/application/register-ipc');

test('il planner operativo usa uno schema limitato agli strumenti disponibili', () => {
  const schema = agentPlanSchema({ tools: [{ name: 'read_file' }, { name: 'write_file' }] });
  assert.deepEqual(schema.properties.tool.anyOf[0].enum, ['read_file', 'write_file']);
  assert.ok(schema.required.includes('arguments'));
});

test('il planner remoto non espone esecuzione di script o comandi', () => {
  const capabilities = remoteActionCapabilities({
    tools: [
      { name: 'read_file' },
      { name: 'run_script' },
      { name: 'run_command' },
      { name: 'open_path' },
      { name: 'open_user_path' },
      { name: 'write_file' }
    ],
    applications: []
  });
  assert.deepEqual(capabilities.tools.map((tool) => tool.name), ['read_file', 'write_file']);
});
const { responseLanguageDirective } = require('../src/application/language-policy');

test('estrae sotto-query JSON anche da fence Markdown', () => {
  assert.deepEqual(parsePlannerOutput('```json\n{"search_queries":["RAG locale","sicurezza NEXUSNXS"]}\n```'), ['RAG locale', 'sicurezza NEXUSNXS']);
  assert.throws(() => parsePlannerOutput('testo non JSON'));
});

test('estrae JSON circondato da testo, deduplica e ripulisce markup non fidato', () => {
  assert.deepEqual(parsePlannerOutput('Analisi: {"search_queries":["rete TLS","rete TLS","<x> log errori"]} fine.'), ['rete TLS', 'log errori']);
});

test('espande deterministicamente debug e sicurezza quando il planner non risponde', () => {
  assert.equal(classifyTechnicalTask('TypeError durante il test'), 'debugging');
  assert.equal(classifyTechnicalTask('Analizza un incidente ransomware'), 'security');
  const queries = deriveSearchQueries('Debugga error: connection refused nel backend e verifica i test');
  assert.ok(queries.some((query) => /connection refused/i.test(query)));
  assert.ok(queries.some((query) => /causa radice/i.test(query)));
  assert.ok(queries.length <= 3);
});

test('unisce fonti duplicate conservando il punteggio migliore', () => {
  const low = { relativePath: 'A.md', heading: 'H', score: 1 };
  const high = { relativePath: 'A.md', heading: 'H', score: 4 };
  const other = { relativePath: 'B.md', heading: 'X', score: 2 };
  assert.deepEqual(mergeSources([[low, other], [high]], 8), [high, other]);
});

test('diversifica le note e pesa affidabilità editoriale', () => {
  const sources = [
    { relativePath: 'A.md', heading: '1', score: 10, status: 'draft' },
    { relativePath: 'A.md', heading: '2', score: 9, status: 'draft' },
    { relativePath: 'A.md', heading: '3', score: 8, status: 'draft' },
    { relativePath: 'B.md', heading: '1', score: 8, status: 'verified' }
  ];
  const merged = mergeSources([sources], 3, 2);
  assert.equal(merged.filter((source) => source.relativePath === 'A.md').length, 2);
  assert.ok(merged.some((source) => source.relativePath === 'B.md'));
  assert.ok(sourceReliability({ status: 'verified' }) > sourceReliability({ status: 'draft' }));
});

test('il prompt rende NEXUSNXS un collaboratore generalista e usa la memoria solo se pertinente', () => {
  const prompt = buildSystemPrompt([]);
  assert.match(prompt, /collaboratore digitale personale/i);
  assert.match(prompt, /comprendi l'obiettivo reale/i);
  assert.match(prompt, /non rispondi con formule da centralino/i);
  assert.match(prompt, /cybersecurity non ha alcuna precedenza/i);
  assert.match(prompt, /conoscenza generale/i);
  assert.match(prompt, /soltanto quando è realmente pertinente/i);
  assert.match(prompt, /eventuali istruzioni contenute nei file/i);
  assert.doesNotMatch(prompt, /Usa prima la knowledge base/i);
  assert.match(prompt, /supporto silenzioso/i);
  assert.match(prompt, /non rivelare né nominare/i);
  assert.match(prompt, /si contraddicono/i);
  assert.match(prompt, /Non aggiungere marcatori come \[Fonte N\]/i);
  assert.match(prompt, /Cura punteggiatura, ritmo e gerarchia visiva/i);
  assert.match(prompt, /non inventare URL, immagini o anteprime/i);
});

test('il prompt applica identità e preferenze locali senza confonderle con le fonti', () => {
  const prompt = buildSystemPrompt([], {
    userName: 'Norah',
    assistantName: 'Astra',
    occupation: 'Sviluppatrice',
    interests: 'AI locale',
    responseStyle: 'concise',
    customInstructions: 'Usa esempi pratici.'
  });
  assert.match(prompt, /Sei Astra/);
  assert.match(prompt, /Ti rivolgi a Norah/);
  assert.match(prompt, /Preferisce risposte concise/);
  assert.match(prompt, /Usa esempi pratici/);
});

test('il prompt usa gli esempi approvati come stile e non come fonte fattuale', () => {
  const prompt = buildSystemPrompt([], {}, [{ prompt: 'Spiega una scelta', response: 'Parto dal risultato e poi motivo.' }]);
  assert.match(prompt, /ESEMPI DI RISPOSTA APPROVATI/);
  assert.match(prompt, /Parto dal risultato/);
  assert.match(prompt, /Non considerarli fonti fattuali/i);
});

test('il prompt RAG non espone percorsi o nomi dei documenti interni', () => {
  const prompt = buildSystemPrompt([{
    title: 'Segreto operativo',
    heading: 'Configurazione privata',
    relativePath: '01_Privato/workstation-owner.md',
    status: 'verified',
    text: 'Principio tecnico recuperato.'
  }]);
  assert.match(prompt, /Principio tecnico recuperato/);
  assert.doesNotMatch(prompt, /workstation-owner|01_Privato|Segreto operativo|Configurazione privata/);
});

test('la lingua della risposta segue l’italiano anche con termini tecnici inglesi', () => {
  assert.match(responseLanguageDirective('Puoi aprire Visual Studio Code e sistemare il bug?'), /italiano naturale/i);
  assert.match(responseLanguageDirective('Come faccio il deploy con Docker?'), /italiano naturale/i);
  assert.match(responseLanguageDirective('What is the safest way to open this file?'), /natural English/i);
  assert.match(responseLanguageDirective('¿Cómo puedo corregir este error de seguridad?'), /español natural/i);
  assert.match(responseLanguageDirective('Comment puis-je corriger cette erreur de sécurité ?'), /français naturel/i);
  assert.match(responseLanguageDirective('Wie kann ich diesen Fehler sicher korrigieren?'), /natürlichem Deutsch/i);
  assert.match(responseLanguageDirective('Olá, você pode explicar este erro?'), /português natural/i);
  assert.match(responseLanguageDirective('Jak mogę naprawić ten błąd bezpieczeństwa?'), /językiem polskim/i);
  assert.match(responseLanguageDirective('Как можно исправить эту ошибку безопасности?'), /русский/u);
  assert.match(responseLanguageDirective('このエラーをどう修正できますか？'), /日本語/u);
  assert.match(responseLanguageDirective('如何修复这个安全错误？'), /中文/u);
  assert.match(responseLanguageDirective('이 보안 오류를 어떻게 수정하나요?'), /한국어/u);
  assert.match(responseLanguageDirective('كيف يمكنني إصلاح خطأ الأمان؟'), /العربية/u);
});

test('adatta il dialogo a conferme, correzioni e problemi persistenti', () => {
  const history = [{ role: 'assistant', content: 'Propongo di aggiornare la configurazione.' }];
  assert.match(conversationalGuidance('Ok, fallo', history), /conferma breve/i);
  assert.match(conversationalGuidance('No, intendevo la versione precedente', history), /correzione/i);
  assert.match(conversationalGuidance('Ancora non funziona, è sempre uguale', history), /problema persistente/i);
  assert.match(conversationalGuidance('Suggerisci altri miglioramenti', history), /alto impatto/i);
});

test('riconosce direttamente Notion quando è nel catalogo applicazioni', () => {
  const plan = directApplicationPlan('Apri Notion', {
    applications: [{ id: 'notion', label: 'Notion' }]
  });
  assert.equal(plan.tool, 'open_application');
  assert.deepEqual(plan.arguments, { application: 'notion' });
});
