---
title: CSS moderno responsive e design system
type: technical-guide
area: web-development
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: official-docs
tags: [css, responsive, design-system, accessibility, performance]
aliases: [Manuale CSS]
---

# CSS moderno responsive e design system

## Modello mentale

Per ogni proprietà ragiona su cascata, origine, layer, specificità, ereditarietà e valore calcolato. Evita guerre di specificità: componenti piccoli, classi esplicite e `@layer` sono più prevedibili di selettori profondi.

```css
@layer reset, tokens, base, components, utilities;

@layer tokens {
  :root {
    color-scheme: dark;
    --surface: #050b0d;
    --text: #e8fafa;
    --accent: #65e1e4;
    --space-2: .5rem;
    --radius: .8rem;
  }
}

@layer components {
  .card {
    container-type: inline-size;
    padding: clamp(1rem, 3cqi, 2rem);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--surface), var(--accent) 4%);
  }
}
```

## Layout

- Flexbox: distribuzione lungo un asse.
- Grid: righe e colonne coordinate.
- flow normale: prima scelta per contenuti lineari.
- `position: absolute`: sovrapposizioni intenzionali, non struttura generale.
- container query: componente adattivo al proprio contenitore.
- `minmax()`, `min()`, `max()` e `clamp()`: dimensioni fluide con limiti.

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  gap: clamp(.75rem, 2vw, 1.5rem);
}
```

## Accessibilità e movimento

```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

Non usare solo colore per comunicare stato. Mantieni contrasto, target adeguati, reflow al 400%, testo selezionabile e ordine visivo coerente col DOM.

## Performance e debug

Anima preferibilmente `transform` e `opacity`; misura prima di usare `will-change`. Evita blur enormi, filtri su superfici full-screen e migliaia di box-shadow. In DevTools controlla computed styles, layout shift, paint flashing, layer e media emulation.

```powershell
npx stylelint "**/*.css"
npx playwright test
npx lighthouse http://127.0.0.1:4173
```

## Progetto

Crea un piccolo design system con token, Button, Field, Dialog, Toast e DataTable. Documenta stati idle/hover/focus/disabled/loading/error, tastiera, responsive, contrasto, reduced motion e screenshot regression su tre viewport.

## Fonti

- MDN CSS: https://developer.mozilla.org/en-US/docs/Web/CSS
- W3C CSS specifications: https://www.w3.org/Style/CSS/
- WCAG: https://www.w3.org/WAI/standards-guidelines/wcag/

## Collegamenti

- [[Indice - CSS]]
- [[HTML semantico accessibile e verificabile]]
- [[03_Sviluppo/Testing e qualita del software|Testing]]
