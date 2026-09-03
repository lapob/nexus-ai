/**
 * @module application/response-continuation
 * @description Continuità deterministica per risposte fermate dal limite del modello.
 */

function continuationMessages(messages, answer) {
  const history = Array.isArray(messages) ? messages : [];
  return [
    ...history,
    // Il contratto provider limita ogni messaggio a 12.000 caratteri. Mantiene
    // il margine necessario al prompt di controllo senza perdere il punto di
    // ripresa nelle risposte molto lunghe.
    { role: 'assistant', content: String(answer || '').slice(-11_000) },
    {
      role: 'user',
      content: 'Continua esattamente dal carattere successivo, senza introduzioni e senza ripetere testo già scritto. Completa tutte le sezioni richieste e termina con una frase conclusiva completa.'
    }
  ];
}

function continuationDelta(previous, next) {
  const existing = String(previous || '');
  const candidate = String(next || '');
  if (!existing || !candidate) return candidate;
  const maximum = Math.min(2_048, existing.length, candidate.length);
  for (let overlap = maximum; overlap >= 3; overlap -= 1) {
    if (existing.endsWith(candidate.slice(0, overlap))) return candidate.slice(overlap);
  }
  return candidate;
}

function createContinuationTokenPublisher(previous, publish) {
  const existing = String(previous || '');
  const emit = typeof publish === 'function' ? publish : () => {};
  let received = '';
  let published = '';
  let overlapResolved = !existing;

  const couldStillBeRepeatedSuffix = () => {
    if (!received || received.length > Math.min(2_048, existing.length)) return false;
    const maximum = Math.min(2_048, existing.length);
    for (let overlap = maximum; overlap >= Math.max(3, received.length); overlap -= 1) {
      if (existing.slice(-overlap).startsWith(received)) return true;
    }
    return false;
  };

  const publishCanonical = () => {
    const canonical = continuationDelta(existing, received);
    if (!canonical.startsWith(published)) return;
    const addition = canonical.slice(published.length);
    if (addition) emit(addition);
    published = canonical;
  };

  return {
    onToken(token) {
      const chunk = String(token || '');
      if (!chunk) return;
      received += chunk;
      if (!overlapResolved) {
        if (couldStillBeRepeatedSuffix()) return;
        overlapResolved = true;
      }
      publishCanonical();
    },
    complete(content) {
      const finalContent = String(content || received);
      if (finalContent !== received) received = finalContent;
      overlapResolved = true;
      publishCanonical();
      return continuationDelta(existing, received);
    }
  };
}

module.exports = { createContinuationTokenPublisher, continuationDelta, continuationMessages };
