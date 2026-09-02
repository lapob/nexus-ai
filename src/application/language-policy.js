/**
 * @module application/language-policy
 * @description Rileva conservativamente la lingua del turno più recente e produce una direttiva isolata dal resto dell'orchestrazione IPC.
 */

// #region 01 — Rilevamento conservativo

const LANGUAGE_PROFILES = Object.freeze([
  { id: 'italiano', pattern: /\b(?:il|lo|la|gli|una|del|della|che|come|cosa|per|con|non|puoi|vorrei|devo|sono|hai|apri|sistema|spiega|perché|più|così|già)\b/g, orthography: /[àèéìòù]/, strong: /^(?:ciao|salve|buongiorno|buonasera|grazie)(?:\s|[!?.]|$)/u },
  { id: 'inglese', pattern: /\b(?:the|an|of|to|and|is|are|what|how|why|can|could|please|explain|open|fix|with|should)\b/g, strong: /^(?:hello|hi|hey|thanks|thank you)(?:\s|[!?.]|$)/u },
  { id: 'spagnolo', pattern: /\b(?:el|los|las|una|del|que|cómo|por|para|con|puedes|quiero|debo|explica|abre|corrige|seguridad)\b/g, orthography: /[¿¡ñ]|[áéíóú]/, strong: /^(?:hola|gracias|buenos días|buenas tardes|buenas noches)(?:\s|[!?.]|$)/u },
  { id: 'francese', pattern: /\b(?:le|les|une|des|que|comment|pourquoi|avec|peux|voudrais|dois|explique|ouvre|corrige|sécurité)\b/g, orthography: /[çœ]|[àâæéèêëîïôùûüÿ]/, strong: /^(?:bonjour|bonsoir|salut|merci)(?:\s|[!?.]|$)/u },
  { id: 'tedesco', pattern: /\b(?:der|die|das|den|diesen|ein|eine|und|ist|sind|was|wie|warum|mit|kann|kannst|möchte|muss|erkläre|öffne|korrigiere|fehler|sicherheit)\b/g, orthography: /[äöüß]/, strong: /^(?:hallo|danke|guten morgen|guten tag|guten abend)(?:\s|[!?.]|$)/u },
  { id: 'portoghese', pattern: /\b(?:o|os|uma|do|da|que|como|porque|para|com|você|pode|quero|devo|explique|abra|corrija|segurança)\b/g, orthography: /[ãõç]|[áéíóúâêô]/, strong: /^(?:olá|oi|obrigad[oa]|bom dia|boa tarde|boa noite)(?:\s|[!?.]|$)/u },
  { id: 'olandese', pattern: /\b(?:de|het|een|van|en|is|zijn|wat|hoe|waarom|met|kun|kunt|wil|moet|leg uit|open|herstel|veiligheid)\b/g, strong: /^(?:hallo|hoi|bedankt|dank je)(?:\s|[!?.]|$)/u },
  { id: 'polacco', pattern: /\b(?:ten|ta|to|jest|są|co|jak|dlaczego|oraz|proszę|możesz|chcę|muszę|wyjaśnij|otwórz|napraw|bezpieczeństwo)\b/g, orthography: /[ąćęłńóśźż]/, strong: /^(?:cześć|dzień dobry|dziękuję)(?:\s|[!?.]|$)/u },
  { id: 'russo', pattern: /(?:^|\s)(?:это|как|почему|что|можешь|пожалуйста|хочу|нужно|объясни|открой|исправь|безопасност\p{L}*)(?:\s|[!?.]|$)/gu, strong: /^(?:привет|здравствуйте|спасибо)(?:\s|[!?.]|$)/u },
  { id: 'giapponese', pattern: /(?:です|ます|なぜ|どう|お願い|説明|開いて|修正|安全)/gu, script: /[\u3040-\u30ff]/u, scriptWeight: 4, strong: /^(?:こんにちは|こんばんは|おはよう|ありがとう)(?:\s|[!?.。]|$)/u },
  { id: 'cinese', pattern: /(?:什么|怎么|为什么|请|可以|解释|打开|修复|安全)/gu, script: /[\u3400-\u9fff]/u, scriptWeight: 2, strong: /^(?:你好|您好|谢谢)(?:\s|[!?.。！？]|$)/u },
  { id: 'coreano', pattern: /(?:무엇|어떻게|왜|주세요|설명|열어|수정|보안)/gu, script: /[\uac00-\ud7af]/u, scriptWeight: 4, strong: /^(?:안녕하세요|안녕|감사합니다)(?:\s|[!?.]|$)/u },
  { id: 'arabo', pattern: /(?:^|\s)(?:ما|كيف|لماذا|من|فضلك|يمكنك|أريد|اشرح|افتح|أصلح|الأمان)(?:\s|[!؟.]|$)/gu, script: /[\u0600-\u06ff]/u, scriptWeight: 3, strong: /^(?:مرحبا|السلام عليكم|شكرا)(?:\s|[!؟.]|$)/u }
]);

function detectResponseLanguage(question) {
  const text = String(question || '').toLocaleLowerCase('it-IT');
  const ranked = LANGUAGE_PROFILES.map((language) => ({
    id: language.id,
    score: (text.match(language.pattern)?.length || 0)
      + (language.orthography?.test(text) ? 2 : 0)
      + (language.script?.test(text) ? language.scriptWeight || 3 : 0)
      + (language.strong?.test(text) ? 3 : 0)
  })).sort((left, right) => right.score - left.score);
  return ranked[0].score >= 2 && ranked[0].score > ranked[1].score ? ranked[0].id : 'auto';
}

// #endregion
// #region 02 — Direttiva del modello

function responseLanguageDirective(question) {
  const directives = {
    italiano: 'LINGUA DELLA RISPOSTA: italiano. Rispondi interamente in italiano naturale. I nomi tecnici, il codice e i titoli originali possono restare nella loro lingua, ma non cambiare lingua per questo motivo.',
    inglese: 'RESPONSE LANGUAGE: English. Reply in natural English unless the user explicitly asks for another language.',
    spagnolo: 'IDIOMA DE LA RESPUESTA: español. Responde íntegramente en español natural y conserva en su idioma original solamente el código y los nombres técnicos.',
    francese: 'LANGUE DE LA RÉPONSE : français. Réponds entièrement en français naturel et conserve uniquement le code et les noms techniques dans leur langue d’origine.',
    tedesco: 'ANTWORTSPRACHE: Deutsch. Antworte vollständig in natürlichem Deutsch; nur Code und technische Eigennamen dürfen in ihrer Originalsprache bleiben.',
    portoghese: 'IDIOMA DA RESPOSTA: português. Responda integralmente em português natural; mantenha apenas código e nomes técnicos no idioma original.',
    olandese: 'TAAL VAN HET ANTWOORD: Nederlands. Antwoord volledig in natuurlijk Nederlands; alleen code en technische eigennamen mogen in de oorspronkelijke taal blijven.',
    polacco: 'JĘZYK ODPOWIEDZI: polski. Odpowiedz w całości naturalnym językiem polskim; kod i techniczne nazwy własne mogą pozostać w języku oryginalnym.',
    russo: 'ЯЗЫК ОТВЕТА: русский. Отвечай полностью на естественном русском языке; код и технические имена собственные можно оставить в оригинале.',
    giapponese: '回答言語：日本語。自然な日本語だけで回答し、コードと技術固有名詞のみ原文のまま残してください。',
    cinese: '回答语言：中文。请完全使用自然中文回答，仅代码和技术专有名称可保留原文。',
    coreano: '응답 언어: 한국어. 자연스러운 한국어로만 답하고 코드와 기술 고유명사만 원문으로 유지하세요.',
    arabo: 'لغة الإجابة: العربية. أجب بالكامل بلغة عربية طبيعية، واترك الشفرة والأسماء التقنية فقط بلغتها الأصلية.'
  };
  return directives[detectResponseLanguage(question)] || 'RESPONSE LANGUAGE: detect the language of the latest user message and answer entirely in that same language. Preserve its regional vocabulary and writing system. Do not default to Italian or English merely because technical terms appear in them.';
}

module.exports = { detectResponseLanguage, responseLanguageDirective };

// #endregion
