/**
 * @module scripts/courseify-knowledge
 * @description Converte i capitoli pubblici in lezioni rivolte direttamente al lettore.
 */
const fs = require('node:fs');
const path = require('node:path');

const roots = [
  path.resolve(__dirname, '..', 'knowledge-public', '01_Conoscenza'),
  path.resolve(__dirname, '..', '..', 'knowledge-private', '01_Tech'),
  path.resolve(__dirname, '..', '..', 'knowledge-private', '02_Cybersecurity'),
  path.resolve(__dirname, '..', '..', 'knowledge-private', '03_Development')
].filter((value) => fs.existsSync(value));
const MARKER = '<!-- nexus-course-v1 -->';

// #region 01 — Struttura didattica

function topicFrom(title) {
  return title.replace(/^(Atlante della |Metodo universale di |Mappa universale di )/i, '').toLowerCase();
}

function courseOpening(title) {
  const topic = topicFrom(title);
  return `${MARKER}

> **Come usare questo capitolo**
> Studia una sezione alla volta, riscrivi i concetti con parole tue e applicali
> subito a un caso concreto. Non limitarti a memorizzare definizioni.

## Obiettivi di apprendimento

Alla fine della lezione saprai:

- spiegare i concetti fondamentali di ${topic} con un linguaggio preciso;
- collegare teoria, esempi e conseguenze pratiche;
- scegliere un metodo, uno strumento o una fonte adatta al problema;
- riconoscere errori frequenti, limiti e informazioni ancora da verificare.

## Percorso consigliato

1. Parti dal modello mentale e identifica le parole che non conosci.
2. Segui i passaggi nell'ordine proposto, senza saltare direttamente agli strumenti.
3. Riproduci gli esempi in un ambiente sicuro o con dati non sensibili.
4. Confronta il risultato con una fonte primaria aggiornata.
5. Annota ciò che hai capito, ciò che hai verificato e ciò che resta incerto.

## Lezione`;
}

function courseClosing(title) {
  const topic = topicFrom(title);
  return `## Laboratorio guidato

1. Scegli un caso reale e descrivilo senza proporre subito una soluzione.
2. Individua almeno tre concetti di ${topic} utili per analizzarlo.
3. Formula un'ipotesi verificabile e definisci quale prova potrebbe smentirla.
4. Esegui il test più piccolo, sicuro e reversibile possibile.
5. Registra procedura, risultato, limiti e prossimo passo.

## Verifica dell'apprendimento

Prova a rispondere senza rileggere:

- Qual è il modello mentale centrale del capitolo?
- Quali passaggi seguiresti davanti a un problema nuovo?
- Quale errore potresti commettere applicando la regola fuori contesto?
- Quale fonte primaria useresti per aggiornare questa lezione?
- Riesci a insegnare il concetto principale con un esempio e un controesempio?

Se una risposta rimane vaga, torna alla sezione pertinente e crea un esempio
tuo. Considera completata la lezione solo quando sai spiegare, applicare e
verificare quanto hai studiato.`;
}

// #endregion

// #region 02 — Conversione idempotente

function markdownFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) return markdownFiles(candidate);
    if (!entry.isFile() || !entry.name.endsWith('.md') || /^MOC\s+-/i.test(entry.name)) return [];
    return [candidate];
  });
}

for (const file of roots.flatMap(markdownFiles)) {
  const name = path.basename(file);
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(MARKER)) {
    if (!source.includes('## Lezione')) {
      const migrated = source.replace(
        '5. Annota ciò che hai capito, ciò che hai verificato e ciò che resta incerto.',
        '5. Annota ciò che hai capito, ciò che hai verificato e ciò che resta incerto.\n\n## Lezione'
      );
      fs.writeFileSync(file, migrated, 'utf8');
    }
    continue;
  }
  const heading = source.match(/^# (.+)$/m);
  if (!heading) throw new Error(`Titolo mancante: ${name}`);
  const insertion = `${heading[0]}\n\n${courseOpening(heading[1])}`;
  const converted = source.replace(heading[0], insertion).trimEnd()
    .concat(`\n\n${courseClosing(heading[1])}\n`);
  fs.writeFileSync(file, converted, 'utf8');
}

// #endregion
