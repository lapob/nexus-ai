# Regressione visiva automatica

Scopo: nessun difetto visivo arriva più in una release senza che un test fallisca. L'esempio guida è il nucleo di
particelle tagliato da un "box invisibile": le particelle in fioritura venivano tagliate di netto, lungo una retta, dal
bordo del canvas o dal contenitore che lo ritaglia.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run build:web && npm run qa:visual` | web app e core: confronto con le baseline + controllo geometrico dei bordi |
| `npm run qa:visual -- --build` | come sopra, ricompilando prima `web-dist` |
| `npm run qa:visual:core` | solo il core di particelle |
| `npm run qa:visual -- --only=home,settings-390` | solo le catture il cui nome inizia con uno dei prefissi |
| `npm run qa:visual:android` | Control sull'emulatore, deterministico |
| `npm run qa:visual:android -- --phone` | Control sul telefono reale, in sola lettura |
| `npm run qa:visual:selftest` | dimostra che i test falliscono su difetti reali |
| `npm run qa:visual:approve -- <suite> [nome \| prefisso*]` | approvazione intenzionale delle baseline |
| `.SITE`: `npm run build && npm run qa:visual` | sito: sezioni principali, desktop e telefono |

Ogni esecuzione scrive i propri risultati in `qa-artifacts/visual-runs/<suite>/` (non versionato):
- `actual/`: le catture correnti;
- `expected/`: le baseline;
- `diff/`: le differenze, con i pixel cambiati in rosso sulla base attenuata;
- `results.json`;
- `report.html`: i falliti per primi, con baseline, cattura e differenze affiancate.

Le baseline approvate sono versionate in `qa-artifacts/visual-baselines/<suite>/`, l'unico contenuto di
`qa-artifacts` che entra in Git.

## Copertura

**Suite `web`** (24 catture)
- Superfici: home, conversazione, pannello artefatti e impostazioni.
- Larghezze: 1440×900, 1024×768 e 390×844 (telefono, touch).
- Temi: `prefers-color-scheme` scuro e chiaro.
- Oggi la web app ha solo il tema scuro, quindi le varianti chiare coincidono con quelle scure. Restano come
  protezione: se arriva un tema chiaro, o se il tema smette di essere fisso, il confronto lo segnala.
- Oltre al confronto pixel, falliscono anche gli errori della pagina e lo scorrimento orizzontale.

**Suite `core`** (90 controlli + 18 baseline di forma)
- Backend: Canvas 2D (Chromium del toolchain) e WebGPU (Chrome di sistema).
- Pose: hero (home) e ambiente (conversazione).
- Larghezze: 1440, 1024 e 390.
- Fasi del respiro (`core-breath.ts`):

  | Fase | t |
  |---|---|
  | ingresso | 0,6 s |
  | composto | 4,5 s |
  | fioritura | 7,6 s |
  | zoom massimo | 9,0 s |
  | ricomposizione | 11,6 s |
  | collasso | 22,7 s |

- Controllo geometrico (`scripts/visual/lib/edges.js`):
  1. Si cattura il solo canvas su fondo trasparente: tutto il resto è nascosto, ma i contenitori continuano a
     ritagliare come nella pagina vera. L'alpha del PNG è quindi la luce delle particelle.
  2. Si calcola l'area visibile: canvas ∩ contenitore che ritaglia (lo stage, `overflow: clip`) ∩ finestra.
  3. Sui 4 lati di quest'area, in una striscia di 2 px, l'alpha deve restare ≤ 12/255; sono ammessi al massimo
     3 pixel isolati.
  4. Una fila di particelle accese su un bordo è un taglio netto, cioè il "box invisibile", e il test fallisce.
  5. Anche un core quasi invisibile fa fallire il test, perché una cattura vuota supererebbe ogni bordo.
- In Canvas 2D si confronta anche la forma con le baseline, nelle fasi composto, zoom massimo e collasso.

**Suite `site`** (`.SITE/scripts/visual-regression.mjs`, 20 catture)
- Home: hero, visione, interludio, app, presenza, saturno, sicurezza.
- Pagine: `/desktop`, `/downloads`, `/security`.
- Viewport: 1440×900 e 390×844.

**Suite `android` e `android-phone`** (`scripts/visual/run-android.js`)
- Emulatore:
  - avviarlo con `scripts/start-android-emulator.ps1` (swiftshader, senza VRAM sottratta al modello) e chiuderlo
    a fine prova con `adb -s emulator-5554 emu kill`;
  - attiva il demo mode della system UI (orologio 09:30, batteria e rete fisse) e porta le scale di animazione
    a 0;
  - profili: verticale, font 1,3 e orizzontale;
  - salva ogni impostazione prima e la ripristina sempre, anche in caso di errore.
- Telefono reale (`--phone`), sola lettura:
  - nessuna impostazione, demo mode, force-stop o tocco;
  - procede solo se il telefono è sbloccato e in primo piano ci sono Control o il launcher;
  - non tocca mai Riavvia o Spegni e non inserisce il PIN.
- I seriali non `emulator-*` sono rifiutati senza `--phone`.
- Barra di stato e testi con cifre (valori live) vengono coperti allo stesso modo in catture e baseline.
- Baseline distinte per stato: `offline`, `dashboard`, `altro`.

## Determinismo

- **Tempo**:
  - `page.clock` di Playwright ferma `Date`, `performance.now`, i timer e `requestAnimationFrame`, che avanzano
    solo quando lo chiede il test (`scripts/visual/lib/browser.mjs`);
  - il core gira sul thread principale (`transferControlToOffscreen` rimosso in un init script), così segue lo
    stesso orologio;
  - le transizioni CSS vengono portate allo stato finale (`animations: 'disabled'`).
- **Casualità**: `Math.random` usa un seed fisso (mulberry32), quindi proposte e varianti sono le stesse a ogni
  esecuzione.
- **Browser**: per le baseline si usa il Chromium fissato in `.toolchains/playwright`, che non cambia con gli
  aggiornamenti di Chrome; il Chrome di sistema serve solo per WebGPU.
- **Rete chiusa**: si raggiunge solo l'origine locale e le API sono simulate. Il proxy di `vite preview` verso il
  servizio di produzione non viene mai attraversato.
- **Aggancio concordato `?nxs-qa-time=<s>`**: congela il tempo del core anche nel worker. Accettato dalla
  sessione web/desktop, arriverà con il prossimo blocco del core.
  - Quando ci sarà, `canvas.dataset.qa === 'ready'` segnala il fotogramma pronto, e si potrà provare anche il
    percorso worker.
  - Il sito lo ha già (alias di `?nxs-still`), e dal 16 novembre 2026 il suo test lo usa per impostazione predefinita
    insieme all'orologio fermo.
    - Prima dello scroll si caricano e decodificano le immagini pigre; lo scroll emette subito l'evento `scroll`.
    - Così cinque esecuzioni consecutive sono identiche al pixel.
    - `--clock-only` torna al solo orologio, che lascia qualche granello (fino a ~70 px).
- **Esito**: due esecuzioni consecutive danno 0,000% di differenza su tutte le catture web, core e sito.

## Soglie

- Il diff (`lib/diff.js`) misura la distanza di colore in YIQ, come pixelmatch, e include l'alpha.
- Tolleranza di 1 px: un pixel conta come cambiato solo se non ha un pixel simile nel suo intorno 3×3, in
  entrambe le immagini. Così l'antialias sub-pixel non genera falsi positivi.
- Dato che le esecuzioni ripetute danno 0,000%, le soglie sono strette:

  | Suite | Fallisce oltre |
  |---|---|
  | web | 0,2% o 120 px |
  | core | 0,4% o 240 px |
  | sito | 0,2% o 150 px |
  | Android | 0,2% o 1500 px (su 2,6 Mpx) |

- Il limite assoluto coglie i difetti piccoli ma reali: un controllo spostato di 6 px cambia circa 300 px, lo
  0,03% di 1440×900.

## Prova che fallisce davvero

`npm run qa:visual:selftest` copia `web-dist`, reintroduce due difetti nella build compilata (i sorgenti non
vengono toccati) e pretende che i test li segnalino. Esce con 0 solo se li rileva entrambi.

1. **Box invisibile**: nucleo in scala piena del canvas (SPREAD 1) e nessuna sfumatura verso i bordi, sia in
   WebGPU sia in Canvas 2D. Esito misurato il 15/11/2026: il controllo geometrico trova particelle tagliate sui
   bordi sinistro e destro a 390 px, con picchi di alpha tra 80 e 98 contro un limite di 12.
2. **Composer spostato di 6 px**: la suite `web` fallisce (home 1440 e conversazione 390).

Al termine la copia alterata viene cancellata. I suoi rapporti restano in `qa-artifacts/visual-runs/*-selftest/`.

Il 15/11/2026 la suite Android è stata provata anche con una regressione naturale: sull'emulatore le icone di rete
del demo mode hanno superato la soglia, e da allora la barra di stato è coperta.

## Approvare un cambiamento voluto

1. Eseguire la suite e aprire il rapporto `report.html`.
2. Se la differenza è voluta, per tutta la suite o per i nomi indicati:
   ```bash
   npm run qa:visual:approve -- web settings-*
   ```
   In alternativa, rieseguire la suite con `--update`. Non è ammesso con `--dist` o `--tag`.
3. Committare le nuove baseline insieme alla modifica che le giustifica.

Un confronto non riscrive mai le baseline.

## Limiti noti

- Il percorso worker del core non è catturato finché manca `?nxs-qa-time`; lo copre il thread principale, che
  usa lo stesso motore (`core-render.ts`).
- L'emulatore con swiftshader può rasterizzare in modo leggermente diverso da quello con GPU host usato per le
  prime baseline Android. Alla prima esecuzione rivedere il rapporto e, se serve, riapprovarle. I tempi dei frame
  dell'emulatore non sono rappresentativi.
- Il sito importa il motore da `../.AI`: gira solo sulla workstation completa e non fa parte di `npm test` né
  della CI del sito.
- WebGPU dipende dal Chrome di sistema. Se manca, la suite core lo segnala e prosegue con Canvas 2D.
