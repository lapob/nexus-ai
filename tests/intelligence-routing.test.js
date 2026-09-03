const test = require('node:test');
const assert = require('node:assert/strict');
const { intelligenceSignals, resolveIntelligenceMode, shouldUseDeliberateThinking, shouldPreferFastExecutionModel, instantConversationalReply } = require('../src/application/intelligence-routing');

test('espone confidenza, rischio e revisione selettiva', () => {
  const simple = intelligenceSignals({ question: 'Ciao' });
  assert.equal(simple.confidence, 0.99);
  assert.equal(simple.needsReview, false);
  const sensitive = intelligenceSignals({ question: 'Analizza questa prompt injection e il rischio per una API key.' });
  assert.equal(sensitive.mode, 'deep');
  assert.equal(sensitive.risk, 'critical');
  assert.equal(sensitive.needsReview, true);
});

test('mantiene immediate le richieste semplici', () => {
  assert.equal(resolveIntelligenceMode({ question: 'Cos’è una VLAN?' }), 'fast');
  assert.equal(resolveIntelligenceMode({ question: 'Grazie' }), 'fast');
});

test('un saluto isolato non carica alcun modello', () => {
  assert.equal(instantConversationalReply('Ciao!'), 'Ciao! Come posso aiutarti?');
  assert.equal(instantConversationalReply('Grazie mille'), 'Di nulla. Sono qui quando vuoi.');
  assert.equal(instantConversationalReply('Chi è Lapo Bardi?'), 'Lapo Bardi è l’inventore di questa bellissima AI: programmatore, informatico e, per sua stessa definizione, super sexy.');
  assert.equal(instantConversationalReply('Ciao, analizza questo progetto'), null);
});

test('i convenevoli multilingua restano immediati e nella lingua dell utente', () => {
  assert.equal(instantConversationalReply('Hola'), '¡Hola! ¿Cómo puedo ayudarte?');
  assert.equal(instantConversationalReply('Merci beaucoup'), 'Avec plaisir. Je suis là quand vous voulez.');
  assert.equal(instantConversationalReply('Guten Abend'), 'Hallo! Wie kann ich helfen?');
  assert.equal(instantConversationalReply('Olá'), 'Olá! Como posso ajudar?');
  assert.equal(instantConversationalReply('こんにちは'), 'こんにちは。どのようにお手伝いできますか？');
  assert.equal(instantConversationalReply('你好'), '你好！我能帮你做什么？');
  assert.equal(instantConversationalReply('안녕하세요'), '안녕하세요! 무엇을 도와드릴까요?');
  assert.equal(instantConversationalReply('مرحبا'), 'مرحبًا! كيف يمكنني مساعدتك؟');
  assert.equal(instantConversationalReply('Hola, analiza este proyecto'), null);
});

test('promuove i lavori complessi al modello principale', () => {
  assert.equal(resolveIntelligenceMode({ question: 'Analizza questo progetto, correggi gli errori e poi ottimizza architettura, test e sicurezza dell’applicazione.' }), 'deep');
});

test('riconosce il lavoro complesso anche nelle lingue principali', () => {
  assert.equal(resolveIntelligenceMode({ question: 'Analyze this repository, fix the architecture errors and optimize its performance step by step.' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Analiza esta aplicación, corrige los errores y optimiza la seguridad y el rendimiento.' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Analysiere diese Anwendung und optimiere Architektur, Sicherheit und Leistung.' }), 'deep');
});

test('rispetta la scelta profonda e gli allegati', () => {
  assert.equal(resolveIntelligenceMode({ question: 'ciao', requestedMode: 'deep' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'riassumi', attachmentCount: 1 }), 'deep');
});

test('promuove incidenti, vincoli multipli e richieste di verifica', () => {
  const incident = intelligenceSignals({ question: 'Trova la causa radice del data breach in produzione, verifica le evidenze e prepara il rollback.' });
  assert.equal(incident.mode, 'deep');
  assert.ok(incident.reasons.includes('high-stakes'));
  assert.ok(incident.reasons.includes('verification'));
  assert.equal(resolveIntelligenceMode({ question: 'Controlla questa modifica:\n- esegui i test\n- misura le prestazioni\n- verifica la sicurezza' }), 'deep');
});

test('approfondisce richieste ambigue e domande composte', () => {
  const ambiguous = intelligenceSignals({ question: 'Non è chiaro: potrebbe dipendere dal modello o dal microfono?' });
  assert.equal(ambiguous.mode, 'deep');
  assert.ok(ambiguous.reasons.includes('ambiguity'));
  assert.equal(resolveIntelligenceMode({ question: 'Qual è la causa? Come la verifico? Quale correzione applico?' }), 'deep');
});

test('instrada al modello principale il caso di ambiguità osservato nella eval', () => {
  const prompt = 'Ho detto: apri bravol. Chiedi una conferma breve invece di inventare il nome di una app.';
  const signals = intelligenceSignals({ question: prompt });
  assert.equal(signals.mode, 'deep');
  assert.equal(signals.risk, 'medium');
  assert.ok(signals.reasons.includes('clarification-required'));
});

test('riserva il modello principale a segreti, prompt injection e simulazione di codice', () => {
  assert.equal(resolveIntelligenceMode({ question: 'Come inserisco una API key nel repository senza esporla?' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Analizza questa prompt injection e spiegami il rischio.' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Qual è l’output di questo codice JavaScript?' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: '¿Cómo protejo una clave API de una inyección de prompt?' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Quel résultat renvoie ce code JavaScript ?' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Welches Ergebnis gibt dieser Python-Code aus?' }), 'deep');
});

test('promuove le azioni locali quando manca ancora un confine autorizzato', () => {
  assert.equal(resolveIntelligenceMode({ question: 'Crea il progetto, ma non ho ancora scelto una cartella.' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Ask for permission before modifying the folder.' }), 'deep');
});

test('non affida al modello rapido codice e ragionamento formale solo perché il prompt è breve', () => {
  const code = intelligenceSignals({ question: 'Scrivi una funzione Python che ordina una lista.' });
  assert.equal(code.mode, 'deep');
  assert.ok(code.reasons.includes('code-creation'));
  const maths = intelligenceSignals({ question: 'Risolvi questa equazione: x² - 5x + 6 = 0.' });
  assert.equal(maths.mode, 'deep');
  assert.ok(maths.reasons.includes('formal-reasoning'));
  assert.equal(resolveIntelligenceMode({ question: 'Prove that sqrt(2) is irrational.' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Calcule cette intégrale.' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'Trova il risultato di questo JavaScript senza inventare: const x=[1,2,3].map(n=>n*2); console.log(x.join(",")); Rispondi soltanto con l’output.' }), 'deep');
});

test('un prefisso da definizione non nasconde segnali critici o di codice', () => {
  assert.equal(resolveIntelligenceMode({ question: 'Cos’è una prompt injection e come proteggo una API key?' }), 'deep');
  assert.equal(resolveIntelligenceMode({ question: 'What is the output of this JavaScript code?' }), 'deep');
});

test('riserva il ragionamento lungo ai problemi che ne traggono beneficio', () => {
  assert.equal(shouldUseDeliberateThinking({
    question: 'Trova il risultato di questo JavaScript: [1,2,3].map(n => n * 2).join(",").'
  }), true);
  assert.equal(shouldUseDeliberateThinking({
    question: 'Scrivi una funzione Python che ordina una lista e gestisce i duplicati.'
  }), false);
  assert.equal(shouldUseDeliberateThinking({
    question: 'Dimostra formalmente che la radice quadrata di due è irrazionale e verifica ogni passaggio.'
  }), true);
  assert.equal(shouldUseDeliberateThinking({
    question: 'Analizza il data breach in produzione, verifica le evidenze e prepara un rollback sicuro.'
  }), true);
  assert.equal(shouldUseDeliberateThinking({ question: 'Ciao', requestedMode: 'deep' }), false);
});

test('usa il modello rapido per richieste ordinarie e riserva il principale ai casi complessi', () => {
  assert.equal(shouldPreferFastExecutionModel({ question: 'Spiegami in due frasi che cos\'e una rete neurale.' }), true);
  assert.equal(shouldPreferFastExecutionModel({ question: 'Traduci in inglese: il cielo e limpido.' }), true);
  assert.equal(shouldPreferFastExecutionModel({ question: 'Scrivi una funzione TypeScript che deduplica un array per id.' }), true);
  assert.equal(shouldPreferFastExecutionModel({ question: 'Scrivi una funzione TypeScript e indicane la complessita.' }), true);
  assert.equal(shouldPreferFastExecutionModel({ question: 'Analizza questa architettura distribuita e proponi una strategia completa.' }), false);
  assert.equal(shouldPreferFastExecutionModel({ question: 'Esegui mentalmente questo codice TypeScript e verifica l output.' }), false);
  assert.equal(shouldPreferFastExecutionModel({ question: 'Correggi questa vulnerabilita nel codice e verifica la sicurezza.' }), false);
});

test('usa Prime per allegati, sicurezza software e correzioni multi-turno', () => {
  const sql = intelligenceSignals({ question: 'La query concatena input utente: correggi la SQL injection.' });
  assert.equal(sql.mode, 'deep');
  assert.equal(sql.risk, 'high');
  assert.ok(sql.reasons.includes('software-security'));
  assert.equal(shouldPreferFastExecutionModel({ question: 'Correggi questa SQL injection.' }), false);
  assert.equal(shouldPreferFastExecutionModel({ question: 'Riassumi questo documento.', attachmentCount: 1 }), false);

  const correction = intelligenceSignals({
    question: 'Correzione: il limite è 12. Riporta soltanto il valore aggiornato.',
    historyCount: 2
  });
  assert.equal(correction.mode, 'deep');
  assert.ok(correction.reasons.includes('context-revision'));
  assert.equal(shouldPreferFastExecutionModel({ question: 'Correzione: usa soltanto Linux.', historyCount: 2 }), false);
  assert.equal(shouldPreferFastExecutionModel({ question: 'Grazie per la spiegazione.', historyCount: 2 }), true);
});
