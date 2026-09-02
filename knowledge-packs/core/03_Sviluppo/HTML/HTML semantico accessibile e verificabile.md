---
title: HTML semantico accessibile e verificabile
type: technical-guide
area: web-development
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: official-docs
tags: [html, semantics, accessibility, seo, testing]
aliases: [Manuale HTML]
---

# HTML semantico accessibile e verificabile

## Sintesi

HTML descrive significato e struttura; CSS presenta, JavaScript orchestra comportamento. Un documento robusto resta comprensibile senza stile e utilizzabile senza mouse.

## Scheletro

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Descrizione specifica della pagina">
  <title>Titolo pagina · Prodotto</title>
</head>
<body>
  <a href="#contenuto">Vai al contenuto</a>
  <header><nav aria-label="Principale">…</nav></header>
  <main id="contenuto">
    <h1>Un solo argomento principale</h1>
    <section aria-labelledby="titolo-sezione">
      <h2 id="titolo-sezione">Sezione</h2>
    </section>
  </main>
  <footer>…</footer>
</body>
</html>
```

## Scelta degli elementi

Usa `button` per azioni e `a` per navigazione. `main`, `nav`, `article`, `section`, `aside`, `header` e `footer` creano landmark. Una `section` richiede normalmente un titolo. Una tabella rappresenta dati relazionali, non layout. Associa ogni `label` al controllo; raggruppa opzioni con `fieldset` e `legend`. Un’immagine informativa ha `alt` significativo, una decorativa `alt=""`.

Preferisci semantica nativa ad ARIA. ARIA completa un widget quando HTML non basta, ma non aggiunge automaticamente tastiera, focus o comportamento.

## Form sicuro

```html
<form method="post" action="/account">
  <label for="email">Email</label>
  <input id="email" name="email" type="email"
         autocomplete="email" required maxlength="254">
  <button type="submit">Salva</button>
  <p id="esito" role="status" aria-live="polite"></p>
</form>
```

La validazione client migliora l’esperienza, ma il server deve ripetere validazione, autorizzazione e normalizzazione. Non inserire segreti nell’HTML, negli attributi `data-*`, nei source map o nei commenti.

## Media e performance

- specifica `width` e `height` per evitare layout shift;
- usa `loading="lazy"` sotto la piega e non sull’immagine principale;
- preferisci formati moderni con fallback coerente;
- usa `picture` e `srcset` quando il contenuto cambia per viewport;
- fornisci sottotitoli e trascrizione per audio/video.

## Verifica

```powershell
npx html-validate "src/**/*.html"
npx lighthouse http://127.0.0.1:4173 --view
npx axe http://127.0.0.1:4173
```

Checklist manuale:

1. percorri tutto con Tab e Shift+Tab;
2. verifica focus visibile e ordine logico;
3. prova zoom 200% e viewport stretto;
4. disabilita CSS e controlla la struttura;
5. prova un lettore di schermo;
6. valida titoli, landmark, label, errori e lingua;
7. controlla HTML generato, non soltanto il template.

## Progetto

Costruisci un sito documentale multipagina: home, ricerca, articolo, form contatti e pagina errore. Criteri: zero errori del validator, tastiera completa, budget Lighthouse documentato, CSP, nessun segreto nel client e test automatico dei landmark.

## Fonti

- MDN, Learn web development: https://developer.mozilla.org/en-US/docs/Learn_web_development
- WHATWG HTML Living Standard: https://html.spec.whatwg.org/
- WAI tutorials: https://www.w3.org/WAI/tutorials/

## Collegamenti

- [[Indice - HTML]]
- [[03_Sviluppo/CSS/CSS moderno responsive e design system|CSS moderno]]
- [[03_Sviluppo/Web frontend accessibile performante e sicuro|Frontend sicuro]]
