# Standard dei commenti

I commenti NEXUSNXS spiegano **perché esiste un confine**, non traducono ogni riga
in italiano. Il codice deve restare leggibile anche senza commenti.

## Intestazione obbligatoria

Ogni file sotto `src/` deve iniziare con:

```js
/**
 * @module area/nome-file
 * @description Responsabilità del modulo in una frase.
 */
```

CSS, HTML e PowerShell usano la sintassi di commento propria del linguaggio.

## Sezioni comprimibili

I file lunghi usano regioni numerate:

```js
// #region 01 — Contratti e costanti
// #endregion

// #region 02 — Logica pubblica
// #endregion
```

Non inserire regioni annidate senza necessità. Se una sezione supera circa
150 righe, valutare prima di estrarla in un modulo dedicato.

## Etichette speciali

- `SECURITY:` documenta un confine di sicurezza.
- `CONSENT:` documenta dove è richiesta l'autorizzazione umana.
- `PERF:` spiega un'ottimizzazione non ovvia.
- `NEXUSNXS-EGG:` identifica un easter egg privo di effetti funzionali.

Gli easter egg devono essere piccoli, accessibili e mai influenzare sicurezza,
prestazioni o risultati. Esempio:

```js
// NEXUSNXS-EGG: “The answer is local.” — nessuna telemetria, nessun effetto.
```

## Controllo automatico

`npm run check:sections` impedisce di introdurre file senza intestazione e
richiede almeno due regioni nei moduli lunghi. Il comando è incluso in
`npm run check`.
