/** @module shared/conversation-preferences Explicit, non-sensitive conversational choices. */
// #region Portable profile contract
function normalizeConversationPreferences(value, fallback = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const choose = (field, allowed, initial) => allowed.includes(input[field]) ? input[field]
    : allowed.includes(fallback[field]) ? fallback[field] : initial;
  return {
    responseStyle: choose('responseStyle', ['concise', 'natural', 'detailed'], 'natural'),
    tone: choose('tone', ['neutral', 'warm', 'direct'], 'neutral'),
    responseLanguage: choose('responseLanguage', ['auto', 'it', 'en', 'es', 'fr', 'de'], 'auto')
  };
}

function conversationPreferenceDirective(value) {
  const profile = normalizeConversationPreferences(value);
  const detail = {
    concise: 'Preferisce risposte concise: conserva fatti decisivi e istruzioni necessarie.',
    natural: 'Preferisce risposte proporzionate alla richiesta.',
    detailed: 'Preferisce spiegazioni dettagliate quando utili, senza ripetizioni.'
  }[profile.responseStyle];
  const tone = {
    neutral: 'Tono naturale, cordiale e sobrio.',
    warm: 'Tono caloroso ed empatico: riconosci cio che l utente dichiara, senza attribuirgli emozioni, diagnosticare o fingere sentimenti tuoi.',
    direct: 'Tono diretto e pragmatico: parti dalla conclusione, senza risultare brusco.'
  }[profile.tone];
  return `PREFERENZE ESPLICITE: ${detail} ${tone} La richiesta corrente prevale sulle preferenze. Non fingere esperienze, coscienza o emozioni umane. Non memorizzare stati emotivi inferiti.`;
}
// #endregion
module.exports = { normalizeConversationPreferences, conversationPreferenceDirective };
