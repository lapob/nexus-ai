# NEXUS.AI — UI Specification

Stato: proposta vincolante per approvazione

Target: renderer Electron desktop, HTML/CSS/JavaScript vanilla e Canvas 2D

Branch di progettazione: `design/nexus-interface-rebuild`

Questa specifica è la fonte di verità per il rebuild del renderer. I valori indicati sono requisiti, non suggerimenti estetici. Ogni deviazione durante l'implementazione richiede una decisione esplicita e documentata.

# 1. Visione del prodotto

Nexus.AI deve comunicare la presenza di un sistema cognitivo locale, persistente e orientato alla conoscenza. L'utente non apre una chat: entra in uno spazio nel quale memoria, fonti, progetti e capacità future hanno relazioni visibili.

Il Nexus Core è il centro semantico e visivo. Rappresenta lo stato complessivo del sistema, mantiene la gerarchia del graph e assorbe il focus quando non esiste un'attività più specifica. Non è un logo animato.

La chat è un canale operativo secondario. Rimane disponibile senza occupare stabilmente il desktop e si espande soltanto quando l'utente conversa o quando una risposta richiede spazio.

HUD, dock e pannelli forniscono orientamento e azioni. Devono apparire solo quando il loro contenuto è disponibile o richiesto. Non devono competere con il Core.

Nexus.AI si differenzia da un chatbot perché il contesto è spaziale e persistente; si differenzia da una dashboard perché non organizza metriche in card o colonne; si differenzia da un graph viewer perché il graph è anche superficie di navigazione e stato del sistema.

## Principi non negoziabili

1. **Graph-first:** il graph occupa il viewport, non un contenitore nel viewport.
2. **Continuous space:** nessun overlay modifica le dimensioni del graph o crea colonne permanenti.
3. **Progressive disclosure:** dettagli, chat e controlli compaiono quando necessari e sono richiudibili.
4. **Readable before decorative:** ogni informazione funzionale è almeno 13 px e mantiene contrasto WCAG AA dove applicabile.
5. **Truthful system state:** nessun `READY`, `ONLINE`, conteggio o capacità viene mostrato senza evidenza runtime.

# 2. Anti-pattern vietati

- Layout principale a due o tre colonne.
- Sidebar o chat permanente a tutta altezza.
- Header tradizionale esteso da bordo a bordo.
- Graph racchiuso in box, card, pannello o area con bordo.
- Griglie dashboard, KPI card e contenitori ripetuti.
- Grandi superfici opache che nascondono il graph.
- Bordo completo attorno a ogni controllo o informazione.
- Testo funzionale sotto 13 px.
- Chat aperta al bootstrap senza richiesta o conversazione attiva.
- Indicatori di stato simulati, inclusi agenti “ready” non esistenti.
- Glow neon saturo, bloom diffuso o gradienti arcobaleno.
- Animazioni continue su elementi DOM senza significato di stato.
- Particelle dense che compromettono label o frame rate.
- Azioni abilitate che non hanno un comportamento implementato.
- Uso del colore come unico segnale di stato.
- Sovrapposizione simultanea di più overlay primari.

# 3. Architettura visiva

| Livello | Z concettuale | Materiale/opacità | Movimento | Input |
|---|---:|---|---|---|
| Background | 0 | `--color-bg`, opaco | nessuno | no |
| Ambient field | 10 | grana 2–3%, vignetta 20–32%, particelle ≤12% | parallasse ≤4 px | no |
| Graph scene | 20 | Canvas trasparente | loop principale | pan, zoom, selezione |
| Graph labels | 30 | Canvas o layer DOM accessibile | segue camera | focus tastiera se DOM |
| Focus effects | 40 | glow e attenuazione locali | transizione focus | no |
| HUD | 50 | nessun fondo o fondo ≤42% | ingresso/uscita | sì |
| Context panel | 60 | superficie 72–82%, blur 18 px | fade/translate/blur | sì |
| Chat | 70 | superficie 76–86%, blur 22 px | expand/collapse | sì |
| Dock | 80 | superficie 64–76%, blur 20 px | proximity/hover | sì |
| Dialog/notifiche | 90 | superficie elevata 92% | entrata/uscita | modale quando necessario |

Il blur si applica solo agli overlay con contenuto leggibile; non al canvas. Un overlay chiuso deve usare `hidden`, `inert` o rimozione dal flusso di focus, non soltanto `opacity: 0`.

# 4. Layout desktop

Il `graph-viewport` misura sempre `100vw × 100vh`, posizione fixed/inset 0. “Area graph” indica la parte non coperta da overlay, non la dimensione del canvas.

| Viewport | Core idle | Safe area | Chat chiusa | Chat aperta | Context panel |
|---|---|---|---|---|---|
| 1920×1080 | 44% W, 48% H | 28 px lati, 24 px alto, 30 px basso | 520×64, bottom-right | 540 px, max 72vh | 340–380 px, sinistra |
| 1440×900 | 43% W, 47% H | 24 px lati, 20 px alto, 26 px basso | 480×62, bottom-right | 500 px, max 70vh | 320–350 px, sinistra |
| 1280×720 | 42% W, 45% H | 18 px lati, 16 px alto, 22 px basso | 440×60, bottom-right | 460 px, max 68vh | 300–320 px, lato libero |

- Il graph occupa fisicamente il 100% e visivamente almeno il 90% della finestra.
- Il Core si sposta al massimo del 7% della larghezza quando la chat è aperta; il canvas non viene ridimensionato.
- Alto sinistra: HUD identità, massimo 300×64 px.
- Alto destra: comandi globali, massimo 520×56 px.
- Dock: centrato, 28–34 px dal bordo inferiore.
- Chat chiusa: bottom 28–32 px, right 28–32 px, salvo collisione con dock.
- Context panel: top 112–140 px; non deve coprire il Core.
- Nessun overlay deve occupare oltre il 30% della larghezza senza essere modale.

# 5. Wireframe ASCII

## 5.1 Stato iniziale

```text
1920 × 1080 — graph 100%, overlay <10%
┌──────────────────────────────────────────────────────────────────────────────┐
│  [N] NEXUS · INITIALIZING/READY                  [⌘K Search] [model] [time] ⚙ │ 56
│                                                                              │
│                 MEMORY                                                      │
│                    ╲                                                         │
│       VAULT ────── (        NEXUS CORE        ) ────── PROJECTS             │
│             ╲       ╲      300–360 px       ╱       ╱                        │
│           RESEARCH    AGENTS ─── MODELS       LABS                           │
│                      UNIVERSITY · CYBERSECURITY                              │
│                                                                              │
│                              [floating dock 60–68]    [Ask Nexus… 520×64]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 5.2 Nodo selezionato

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [HUD]                                                               [TOOLS] │
│  ┌─ context 360 × auto ─────────┐                                             │
│  │ VAULT                        │        secondary nodes 35–55% opacity       │
│  │ Knowledge source             │                    ╭────────╮               │
│  │ Description…                 │──── focused path ──│ VAULT  │               │
│  │ 12 connections · if real     │                    ╰────────╯               │
│  │ [Open note] [Close]          │                       CORE                 │
│  └──────────────────────────────┘                                             │
│                               [dock unchanged]          [chat input]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 5.3 Chat aperta

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [HUD]                                                               [TOOLS] │
│                                                                              │
│               CORE translated left ≤7vw                ╭ chat 500–540 ─────╮ │
│         graph visible behind translucent surface       │ Nexus       [—][×]│ │
│                                                       │                    │ │
│              nodes remain interactive outside         │ messages 16–17 px │ │
│                                                       │ max line 62ch      │ │
│                                                       │                    │ │
│                                                       │ Quick / Deep      │ │
│                         [dock]                         │ [input 64 px] [↑] │ │
│                                                       ╰────────────────────╯ │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 5.4 Ricerca aperta

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                      ╭ command palette 640 × ≤560 ─╮                         │
│                      │ ⌕ Search knowledge…          │                         │
│                      ├───────────────────────────────┤                         │
│ graph opacity 55–65% │ Notes / Nodes / Actions       │                         │
│ remains in place     │ > result                       │                         │
│                      │   result                       │                         │
│                      ╰───────────────────────────────╯                         │
│                            dock dimmed, no reflow                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 5.5 Stato di errore

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [N] NEXUS · ERROR — renderer bridge unavailable                     [details]│
│                                                                              │
│                    CORE static, no false pulse                               │
│                  graph navigation local remains usable                       │
│                                                                              │
│        [Error strip: concise cause · Retry if safe · Open diagnostics]        │
│                                                          [chat disabled]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

# 6. Nexus Core

- Posizione idle: `(44%, 48%)` a 1920, `(43%, 47%)` a 1440, `(42%, 45%)` a 1280.
- Diametro visivo: `clamp(260px, 19vw, 380px)`; almeno 3,5× il diametro di un nodo primario.
- Forma: volume pseudo-sferico composto da particelle e filamenti, con centro riconoscibile; niente immagine bitmap.
- Label: `NEXUS CORE`, almeno 24 px, visibile a zoom 1; sottolabel 13–14 px.
- Nodi primari: Memory 0,82; Vault 0,88; Agents 0,82; Projects 0,74; Research 0,68; University 0,68; Cybersecurity 0,78; Models 0,72; Labs 0,62 rispetto a un diametro base di 72 px.
- Distanza dal Core: 1,8–3,2 raggi del Core, distribuzione per settori stabili. Nessun random layout a ogni avvio.
- Edge primari: 0,7–1,1 px a DPR 1, alpha 16–32%; edge secondari 0,5–0,8 px, alpha 10–22%.
- Glow idle: raggio massimo 1,35× il nodo, alpha ≤16%.
- Respirazione idle: scala massima ±1,8%, periodo 6–9 s.
- Drift nodi: massimo 3 px, periodo 9–16 s; il Core non deriva.
- Hover: raggiunge lo stato in 180 ms; aumento scala ≤4%, label +15% contrasto.
- Selezione: anello o halo non dipendente solo dal colore; nodi non collegati al 35–50%; percorso selezionato al 75–100%.

Gerarchia iniziale obbligatoria:

```text
NEXUS CORE
├── MEMORY
├── VAULT
├── AGENTS
├── PROJECTS
├── RESEARCH
├── UNIVERSITY
├── CYBERSECURITY
├── MODELS
└── LABS
```

Stati del Core:

- **IDLE/READY:** respirazione lenta; flusso edge minimo.
- **REASONING/THINKING:** densità interna +10%, impulsi diretti verso il Core, periodo ≥2,4 s.
- **SEARCHING:** sweep singolo sugli edge candidati; nessun flashing.
- **ERROR:** animazione ferma o ridotta, outline error non pulsante, label di stato esterna.
- **OFFLINE:** saturazione −35%, movimento locale ancora disponibile.

# 7. Camera e profondità

- Zoom minimo `0.62`, massimo `1.85`; zoom iniziale `1`.
- Wheel/trackpad: moltiplicatore esponenziale `exp(-deltaY × 0.0010)`; zoom centrato sul puntatore se implementabile senza instabilità.
- Pan: soglia drag 5 px per distinguere click; pointer capture durante drag.
- Damping traslazione: interpolazione frame-rate independent equivalente a 0,10–0,14 per frame a 60 Hz.
- Inerzia: massimo 180 ms di proiezione della velocità, decadimento fino a 650 ms; nessun rimbalzo.
- Focus automatico: 520–680 ms con `--ease-emphasized`; il nodo arriva entro il 12% dal punto focale, non necessariamente al centro.
- Ritorno: conserva camera precedente; comando Escape o reset in 600 ms.
- Parallasse puntatore: background ≤2 px, particelle profonde ≤4 px, graph ≤1,5 px.
- Idle camera: nessuna traslazione autonoma; solo micro-profondità interna, per evitare nausea.
- Limiti pan: almeno il 25% del Core o un nodo primario deve restare nel viewport; clamp morbido.
- Reduced motion: nessuna inerzia, drift, parallax o interpolazione prolungata; focus ≤100 ms.

# 8. Chat overlay

## Stato chiuso

- Barra flottante: `clamp(420px, 29vw, 560px) × 64px`.
- Posizione: right 30 px, bottom 30 px; a larghezze ≤1440, right 24 px.
- Contiene: trigger/textarea, modalità Quick/Deep, invio; modello solo se noto.
- Lo storico è nascosto e non focusable.
- Click/focus nell'input apre la chat solo dopo digitazione o comando esplicito; un invio apre lo storico.

## Stato aperto

- Larghezza `min(540px, calc(100vw - 48px))`; minimo 460 px su desktop.
- Altezza `min(72vh, 760px)`, minimo 420 px quando disponibile.
- Stesso ancoraggio bottom-right; espansione verso l'alto.
- Surface alpha 78–86%, `backdrop-filter: blur(22px) saturate(1.05)`; bordo solo sul lato di separazione o highlight superiore ≤1 px.
- Header 52 px: nome, stato reale, minimizza e chiudi; niente tab non funzionanti.
- Messaggi 16–17 px, line-height 1,62; distanza blocchi 22–28 px; paragrafi max 62ch.
- Input 16–17 px, altezza minima 56 px, massima 144 px; target azioni ≥44×44.
- Quick/Deep: label 13–14 px e valore testuale, non solo icona.
- Scroll confinato ai messaggi; wheel sopra la chat non raggiunge il graph.
- Apertura 360 ms, chiusura 280 ms; opacity + translateY 12 px + scale 0,985, nessuna animazione di width con layout thrashing.
- Durante THINKING l'input resta disponibile solo se il backend supporta cancellazione; il pulsante invio diventa “Stop” con label accessibile.
- Errore: messaggio inline leggibile con azione Retry solo quando sicura; non sostituisce lo stato globale.
- Resize: sotto 900 px di larghezza, overlay con inset 16 px e larghezza automatica; non diventa sidebar.

# 9. Context panel

- Appare solo dopo selezione di un nodo o comando esplicito.
- Desktop ampio: sinistra, 32 px dal bordo, top 132 px, larghezza 360 px, max-height 56vh.
- Se collide con il nodo focalizzato o con la chat, passa al lato con maggiore spazio.
- Contenuto ammesso: titolo, categoria, descrizione, connessioni reali, file reali, azioni disponibili.
- Contenuto assente: sezione omessa, mai sostituita con numeri mock.
- Azioni: apri nota quando esiste `relativePath`; chiudi; eventuali azioni future disabilitate e marcate “Non disponibile”.
- Entrata 320 ms: opacity 0→1, translateX ±14 px→0, blur 8→0.
- Uscita 220 ms; dopo l'uscita `hidden` e `inert`.
- Escape chiude prima il context panel, salvo overlay con priorità maggiore.
- Con chat aperta: pannello massimo 320 px; se la larghezza libera è <700 px, diventa popover bottom-left o viene chiuso dopo conferma implicita della selezione.

# 10. Floating dock

- `position: fixed; left: 50%; bottom: 30px; transform: translateX(-50%)`.
- Altezza 64 px; larghezza derivata da 7 item, massimo 520 px.
- Raggio 32 px, surface alpha 68–76%, blur 20 px.
- Padding 8 px, gap 4 px; target 48×48 px, mai sotto 44×44.
- Proximity scale massimo 1,14; lift massimo 6 px; durata 220 ms, spring controllata.
- Stato attivo: marker geometrico + contrasto, non solo colore.
- Tooltip 13 px, compare dopo 350 ms, massimo una riga.
- Chat aperta: resta centrato; se collide a viewport <1180 px, trasla fino a 12vw senza cambiare ordine.

Voci:

| Voce | Stato iniziale |
|---|---|
| Core | attiva, reset/focus Core |
| Memory | disabilitata finché non esiste funzione reale |
| Search | attiva, apre command palette |
| Agents | disabilitata, label “Non disponibile” |
| Projects | seleziona nodo mock; nessuna query automatica |
| Models | seleziona nodo e/o apre settings solo con azione esplicita |
| Settings | attiva |

# 11. HUD

## Alto sinistra

- Logo/mark 40 px; nome `NEXUS` 16–18 px.
- Stato globale 13–14 px con testo reale: INITIALIZING, READY, DEGRADED, ERROR o OFFLINE.
- Modalità corrente 13 px solo se disponibile.
- Ingombro massimo 310×56 px; nessun fondo completo.

## Alto destra

- Orario 14 px; search 44×44; nome modello 15 px se confermato; settings 44×44.
- Distanza bordo 24–30 px, gap 8–12 px.
- Modello non rilevato: “Modello non verificato”, non “LOCAL/READY”.

## HUD contestuali

- Memory, Vault, Agents, Reasoning e Context sono visibili soltanto con dati bootstrap reali o durante lo stato relativo.
- Titolo 13 px, valore 15–18 px, line-height ≥1,4.
- Materiale: nessuna card; linea verticale 1 px o separatore breve, fondo trasparente.
- Priorità: stato globale > errore > operazione corrente > conteggi > metadati.
- Ammessi: note/chunk restituiti dal bootstrap/reindex, modello configurato, vault source, stato operazione derivato dal renderer.
- Vietati: CPU/RAM non misurati, agenti ready non esistenti, stato RAG attivo senza bootstrap, token/context inventati.
- Dopo 5 s di inattività gli HUD contestuali non critici scendono al 55% di opacity; hover/focus li ripristina.

# 12. Search e command palette

- Apertura: `Ctrl+K`/`Cmd+K`, `/` solo quando nessun input è attivo, oppure dock Search.
- Posizione: top 14vh, centrata; width `min(680px, calc(100vw - 40px))`; max-height 62vh.
- Campo 56 px, font 17 px; risultati 48–56 px ciascuno.
- Categorie iniziali: Nodes e Actions già implementate. Notes solo quando esiste un contratto dati; nessun nuovo IPC in questa fase.
- Keyboard: Arrow Up/Down, Home/End, Enter, Escape; focus trap interno mentre aperta.
- Chiusura: Escape, selezione valida o click sul backdrop; restituisce focus al trigger.
- Empty: “Nessun risultato nel graph corrente”.
- Loading: skeleton statico o progress indicator; niente fake result.
- Error: messaggio con causa normalizzata e possibilità di chiusura.
- Il graph resta fermo nella stessa camera e viene attenuato al 55–65%; nessun cambio pagina.

# 13. Tipografia

```css
--font-xs: 13px;
--font-sm: 14px;
--font-md: 16px;
--font-lg: 18px;
--font-xl: 24px;
--font-2xl: 32px;
--font-display: clamp(36px, 4vw, 64px);
```

| Token | Uso | Peso | Line-height | Tracking |
|---|---|---:|---:|---:|
| xs | label HUD, tooltip, metadata | 500–600 | 1,4 | 0,04–0,10em |
| sm | secondario, controlli | 400–600 | 1,5 | 0–0,04em |
| md | body, input, messaggi | 400–500 | 1,55–1,7 | 0 |
| lg | titoli panel | 550–650 | 1,35 | −0,01em |
| xl | label Core/titoli importanti | 550–650 | 1,2 | −0,015em |
| 2xl | titoli dialog | 450–600 | 1,15 | −0,02em |
| display | eventuale stato iniziale | 350–500 | 1,05 | −0,025em |

- Font UI: `Segoe UI Variable`, fallback `Segoe UI`, sans-serif.
- Font tecnico: `Cascadia Mono`, fallback `Consolas`, monospace; solo label e valori brevi.
- Maiuscole solo per label ≤3 parole, mai per paragrafi o messaggi.
- Testo primario ≥4.5:1 sul materiale finale; secondario ≥4.5:1 se funzionale.
- Riga chat massimo 62ch; descrizioni context massimo 48ch.
- Nessun testo funzionale sotto 13 px; chat e input almeno 16 px.

# 14. Colori e materiali

```css
--color-bg: #020203;
--color-surface: rgba(10, 10, 13, .76);
--color-surface-elevated: rgba(15, 14, 17, .92);
--color-amber-primary: #f2a65a;
--color-orange-secondary: #e86f2c;
--color-text-primary: #f3efeb;
--color-text-secondary: #bdb7b3;
--color-text-muted: #858184;
--color-success: #63c99b;
--color-warning: #e8ad58;
--color-error: #e46772;
--color-link: #f0b477;
--color-line: rgba(232, 214, 200, .12);
--color-glow: rgba(232, 111, 44, .24);
```

- Surface chiusa/compatta 64–76%; overlay leggibile 78–86%; dialog 90–94%.
- Blur: 16–24 px, massimo 28 px; non sommare più di due layer blurred.
- Glow nodo idle alpha ≤16%, selezionato ≤30%, errore ≤24%.
- Vignetta: nero 0% al centro, massimo 58% ai bordi; non oscurare controlli.
- Grana: opacity 2–3%, `mix-blend-mode: soft-light`; disabilitabile su hardware lento.
- Gradienti consentiti: radiali locali per profondità, lineari brevi per dissolvere overlay nel graph.
- Vietati: rainbow, neon cyan/magenta dominante, gradienti su testo body, glass bianco, ombre esterne pesanti su ogni elemento.

# 15. Motion system

```css
--motion-instant: 90ms;
--motion-fast: 180ms;
--motion-medium: 320ms;
--motion-slow: 560ms;
--motion-cinematic: 820ms;
--ease-standard: cubic-bezier(.2, 0, 0, 1);
--ease-emphasized: cubic-bezier(.2, .8, .2, 1);
--ease-decelerate: cubic-bezier(0, 0, .2, 1);
--ease-spring: cubic-bezier(.16, 1.12, .3, 1);
```

| Evento | Durata | Proprietà |
|---|---:|---|
| Bootstrap UI | 560–820 ms | opacity, blur 8→0, translate ≤10 px |
| Selezione nodo | 320 ms | halo/attenuazione |
| Camera focus | 520–680 ms | view transform Canvas |
| Chat open | 360 ms | opacity, translate, scale |
| Chat close | 280 ms | inversa |
| Panel open/close | 320/220 ms | opacity, translate, blur |
| Dock hover | 180–220 ms | scale/lift/contrast |
| Search open | 320 ms | opacity, translateY 12 px |
| Error | 180 ms | color/indicator; no shake |
| Loading | continuo | indicatore singolo ≥1,6 s/ciclo |
| AI response | 180 ms blocco o streaming limitato | opacity/clip, no typewriter lungo |
| Reasoning | ≥2,4 s/ciclo | flusso Core/edge, ampiezza limitata |

Ogni motion deve indicare gerarchia, causalità o stato. Reduced motion porta le transizioni a ≤100 ms, elimina drift, pulsazioni, parallax e streaming carattere per carattere.

# 16. Stati applicativi

| Stato | Indicatore/testo | Colore | Disponibilità | Fallback |
|---|---|---|---|---|
| INITIALIZING | “Inizializzazione” + progress discreto | amber | graph locale, settings chiusi | timeout→ERROR/DEGRADED |
| READY | “Pronto” solo dopo bootstrap risolto | success | tutte le funzioni confermate | — |
| DEGRADED | “Modalità degradata” + causa | warning | graph locale, funzioni disponibili | link dettagli |
| ERROR | “Errore” + causa normalizzata | error | azioni sicure soltanto | retry se idempotente |
| OFFLINE | “Modello non raggiungibile” | muted/warning | graph, vault locale se pronto | settings modello |
| INDEXING | “Indicizzazione” + reindex disabilitato | amber | chat secondo policy backend | esito reale |
| THINKING | “Elaborazione” | amber | cancel disponibile | errore/ready |
| SEARCHING | “Ricerca” | amber | risultati progressivi | empty/error |
| EXECUTING | “Esecuzione” + nome azione reale | amber | blocca conflitti | cancel se supportato |
| IDLE | nessuna label rumorosa | neutral | input e graph | — |

Lo stato globale e quello operativo sono separati: READY+THINKING è valido come `system=READY`, `activity=THINKING`. Se `window.nexus` è assente, lo stato è ERROR; non devono apparire READY, ONLINE o LINK ACTIVE.

# 17. Interazioni

- Click nodo: seleziona; click vuoto non avvia drag finché non supera 5 px.
- Doppio click nodo: apre la risorsa solo se l'azione è disponibile; altrimenti equivale al focus.
- Hover: solo affordance; nessuna informazione essenziale esclusiva.
- Drag graph: pointer capture, cursor grabbing; vietato quando l'origine è un overlay.
- Wheel: zoom solo sul graph; scroll solo nella chat/palette quando il puntatore è sopra l'overlay.
- Enter: invia dalla chat; seleziona nella palette; mai intercettato globalmente da un input multilinea con Shift.
- `Ctrl/Cmd+K`: palette; `/`: palette solo fuori dagli input.
- Escape, priorità: dialog → palette → chat espansa → context panel → focus graph.
- Tab: ordine HUD → graph alternative controls → dock → chat trigger; overlay aperto usa focus trap.
- Focus visible: outline 2 px + offset 3 px, contrasto ≥3:1.
- Un solo overlay primario tra chat espansa e palette; l'apertura della palette minimizza la chat senza cancellarla.
- Settings dialog può sovrapporsi a entrambi e li rende inert.

# 18. Responsive

- **Desktop grande ≥1600 px:** tutte le label primarie; chat 520–540 px; context 360–380 px; HUD completi.
- **Desktop medio 1280–1599 px:** chat 460–500 px; context 320–350 px; HUD contestuali ridotti a massimo tre.
- **Desktop piccolo 960–1279 px:** chat inset 18 px, max 52vw; context sul lato libero o bottom-left; dock solo icone con tooltip; label graph secondarie solo su hover/focus.
- **Molto stretto 720–959 px:** chat quasi full-width bottom sheet max 68vh; context e chat non simultanei; HUD mantiene stato e settings; dock può scorrere orizzontalmente o mostrare cinque azioni prioritarie.
- Sotto 720 px l'app resta utilizzabile ma non è target primario; canvas fullscreen, dock compatto, overlay singolo.
- Il resize non cambia pagina né ricrea il graph; ricalcola metriche in un RAF/debounce.

# 19. Accessibilità

- Testo funzionale contrasto WCAG AA; focus e componenti grafici almeno 3:1.
- Target pointer minimo 44×44 px.
- Ogni controllo icon-only ha `aria-label` e tooltip 13 px.
- Stato globale in `role="status" aria-live="polite"`; errori critici `role="alert"` senza ripetizioni.
- Canvas dispone di descrizione e di una lista DOM equivalente dei nodi, navigabile da tastiera.
- Selezione indicata da forma/halo e testo, non solo colore.
- Dialog e palette ripristinano il focus al trigger.
- `prefers-reduced-motion` elimina movimento continuo non essenziale.
- Zoom browser/font non deve troncare chat o settings al 200%.
- Messaggi e context mantengono line-height ≥1,55.

# 20. Performance

- Un solo loop `requestAnimationFrame` posseduto dal graph engine.
- Budget target: ≤8 ms CPU/frame medio, ≤12 ms p95 a 60 Hz su hardware desktop medio; nessun frame task >50 ms durante idle.
- Nessun `getBoundingClientRect`, style write o DOM update dentro il loop principale.
- Metriche canvas cache; DPR massimo 2, fallback 1,5 in modalità performance.
- ResizeObserver/window resize accorpato in un RAF; nessun polling.
- Stop RAF quando `document.hidden`; restart idempotente.
- Listener registrati una volta e rimossi tramite `destroy()` per moduli ricreabili.
- Particelle: target 300–520, massimo 700; hardware lento 160–260. Edge flow massimo una particella per edge primario.
- Niente allocazioni di array/map per frame nelle hot path; cache di node lookup ed edge geometry quando possibile.
- Aggiornamenti HUD event-driven, mai per frame.
- Cleanup di timeout, streaming, ResizeObserver, media query e pointer capture.

# 21. Architettura renderer proposta

```text
src/renderer/
├── index.html
├── styles.css
├── app.js
├── graph/
│   ├── graph-engine.js
│   ├── graph-data.js
│   ├── graph-camera.js
│   └── graph-interactions.js
├── ui/
│   ├── chat-overlay.js
│   ├── context-panel.js
│   ├── dock.js
│   ├── hud.js
│   ├── search-palette.js
│   └── system-status.js
└── utils/
    ├── motion.js
    └── dom.js
```

- `app.js`: composition root renderer; attende DOM, verifica bridge, governa bootstrap e collega eventi. Non disegna.
- `graph-data.js`: dati statici e gerarchia; nessun DOM/Canvas.
- `graph-camera.js`: view/target, clamp, damping, focus e restore.
- `graph-engine.js`: Canvas, singolo RAF, draw, resize, lifecycle; dipende da data e camera.
- `graph-interactions.js`: pointer/wheel/keyboard e hit testing; emette eventi semantici.
- `system-status.js`: state machine globale/attività, copy veritiera e disponibilità azioni.
- `chat-overlay.js`: storico in memoria, invio/cancel, Quick/Deep, streaming e open/close; usa API iniettata.
- `context-panel.js`: proiezione del nodo selezionato e azioni disponibili.
- `dock.js`: navigazione e availability; non chiama chat come sostituto di feature mancanti.
- `hud.js`: valori bootstrap/reindex e visibility policy.
- `search-palette.js`: ricerca locale su nodi/azioni esistenti e focus management.
- `motion.js`: media query, duration/easing condivisi e helper frame-rate independent.
- `dom.js`: query richieste, escape, focus/inert e listener cleanup.

Dipendenze: `app → ui + graph`; `ui → api interface + utils`; `graph-engine → data + camera`; nessun modulo graph dipende da chat o IPC. L'API preload viene passata ai moduli, non letta globalmente ovunque.

# 22. Mappa DOM proposta

```text
body
└── #nexusShell.nexus-shell[data-system-state="initializing"]
    ├── .ambient-layer[aria-hidden="true"]
    ├── #graphViewport.graph-viewport
    │   ├── #knowledgeCanvas.graph-canvas[role="img"]
    │   ├── #graphLabelLayer.graph-label-layer[aria-hidden="true"]
    │   ├── #graphFocusOverlay.graph-focus-overlay[aria-hidden="true"]
    │   └── #graphNodeList.sr-only[aria-label="Nodi del graph"]
    ├── #topLeftHud.top-left-hud
    │   ├── .nexus-identity
    │   ├── #systemStatus[role="status"][aria-live="polite"]
    │   └── #currentMode
    ├── #topRightHud.top-right-hud
    │   ├── #searchTrigger[aria-haspopup="dialog"]
    │   ├── #modelStatus
    │   ├── #clock
    │   └── #settingsButton
    ├── #contextPanel.context-panel[hidden][inert][aria-labelledby="contextTitle"]
    │   ├── #contextTitle
    │   ├── #contextCategory
    │   ├── #contextDescription
    │   ├── #contextConnections
    │   ├── #contextFiles
    │   ├── #openSelectedNote
    │   └── #contextClose
    ├── #chatOverlay.chat-overlay[data-state="closed"]
    │   ├── #chatHeader
    │   │   ├── #cognitiveState[role="status"]
    │   │   ├── #chatMinimize
    │   │   └── #newChat
    │   ├── #messages[aria-live="polite"]
    │   └── #composer
    │       ├── #reasoningMode
    │       ├── #headerModel
    │       ├── #thinkingIndicator[hidden]
    │       ├── #question
    │       └── #send
    ├── #commandPalette.command-palette[role="dialog"][hidden][inert]
    │   ├── #graphSearch
    │   ├── #searchResults[role="listbox"]
    │   └── #searchStatus[role="status"]
    ├── #floatingDock.floating-dock[aria-label="Navigazione Nexus"]
    │   ├── [data-action="core"]
    │   ├── [data-action="memory"][disabled]
    │   ├── [data-action="search"]
    │   ├── [data-action="agents"][disabled]
    │   ├── [data-action="projects"]
    │   ├── [data-action="models"]
    │   └── #dockSettings
    ├── #settingsDialog[aria-labelledby="settingsTitle"]
    │   └── #settingsForm
    │       ├── #baseUrl
    │       ├── #model
    │       ├── #modelCatalog
    │       ├── #detectModels
    │       ├── #temperature
    │       └── #settingsError[role="alert"]
    ├── #toastRegion.toast-region[aria-live="polite"]
    └── #fatalErrorRegion.sr-only[role="alert"]
```

Inizialmente nascosti/inert: context panel, command palette, expanded chat content, thinking indicator e dialog. Gli ID esistenti necessari a chat/settings/graph vengono conservati; i nuovi ID rappresentano hook UI, non canali IPC.

# 23. Compatibilità funzionale

Comportamenti da preservare:

- `window.nexus.bootstrap()` e popolamento di settings, stats, display name e vault source.
- `window.nexus.chat({ question, history, mode })` con history massimo otto messaggi e mode `fast|deep`.
- `cancel`, `copyText`, `openNote`, `reindex`, `listModels`, `saveSettings` senza modificare firma.
- Quick/Deep, invio Enter, Shift+Enter, cancellazione, fonti, copy e regenerate.
- Settings endpoint/modello/temperatura e rilevamento modelli.
- Ricerca sui nodi statici, selezione, pan, zoom, reset e resize.
- CSP e isolamento renderer.

Canali esistenti, invariati: `nexus:bootstrap`, `nexus:settings`, `nexus:reindex`, `nexus:list-models`, `nexus:cancel`, `nexus:copy`, `nexus:open-note`, `nexus:chat`.

## Gate di bootstrap

Il renderer deve partire dopo `DOMContentLoaded` o con script `defer`. Prima di chiamare l'API verifica la presenza strutturale di `window.nexus` e dei metodi richiesti. Assenza del bridge è un errore reale, non un fallback. Lo stato iniziale è INITIALIZING; READY viene impostato soltanto dopo la risoluzione di `bootstrap()` e l'applicazione valida dei dati.

Analisi corrente: il preload sandboxed usa `require('./application/ipc-contracts')`. Nei preload sandboxed Electron espone un `require` limitato che non carica moduli locali arbitrari; il preload può quindi terminare prima di `contextBridge.exposeInMainWorld`, lasciando `window.nexus` undefined. La correzione futura deve mantenere i nomi dei canali sincronizzati senza disabilitare sandbox/context isolation e deve essere coperta dallo smoke test con verifica esplicita di `typeof window.nexus.bootstrap === 'function'`.

# 24. Piano di implementazione

| Passo | File | Risultato | Test | Completamento |
|---|---|---|---|---|
| 1. DOM | `index.html`, `app.js` | shell/overlay semantici, hook presenti | DOM smoke, ID univoci | nessuna colonna/sidebar |
| 2. Token | `styles.css` | token type/color/motion | audit computed style | minimi tipografici rispettati |
| 3. Graph fullscreen | graph data/engine | canvas 100vw×100vh | screenshot 3 viewport | graph ≥90% visivo |
| 4. Camera | camera/interactions | pan, zoom, inertia, focus | test funzioni pure + manuale | limiti/damping corretti |
| 5. HUD | hud/status | stato reale e dati bootstrap | bootstrap success/error | nessun valore mock |
| 6. Dock | dock | 7 item e availability | keyboard/pointer | target ≥44 px |
| 7. Context | context panel | panel temporaneo | select/close/Escape | hidden quando idle |
| 8. Chat | chat overlay | closed/open, funzioni esistenti | send/cancel/modes | nessuna colonna permanente |
| 9. Search | search palette | nodes/actions, keyboard | shortcut/empty/close | nessun nuovo IPC |
| 10. Stati | system-status/app | state machine e gate | matrice stati | no false READY |
| 11. Accessibilità | tutti UI | ARIA, focus, reduced motion | keyboard + contrast audit | nessun blocker |
| 12. Test | test renderer/smoke | bridge e regressioni | check/test/doctor/smoke | tutto verde |
| 13. Visual QA | renderer | screenshot stati/viewport | 1920, 1440, 1280 | checklist accettazione |

Ogni passo deve lasciare il renderer avviabile. La modularizzazione precede l'aggiunta di motion complesso. Il preload viene corretto solo nel passo bootstrap, con modifica minima motivata e testata.

# 25. Criteri finali di accettazione

- [ ] `graph-viewport` misura 100vw×100vh a 1920, 1440 e 1280.
- [ ] Il graph rimane visibile su almeno il 90% dell'area percepita nello stato iniziale.
- [ ] Non esistono grid/flex principali che creano colonne permanenti.
- [ ] Non esistono sidebar permanenti o focus card idle.
- [ ] Chat iniziale alta 60–64 px e richiudibile; aperta ≤72vh e ≤560 px.
- [ ] Context panel è `hidden/inert` senza selezione.
- [ ] Dock fixed, 60–68 px, target ≥44×44 px.
- [ ] HUD usa separatori e trasparenza, non card complete.
- [ ] Testo funzionale ≥13 px; chat/input ≥16 px; Core label ≥24 px.
- [ ] READY appare esclusivamente dopo bootstrap risolto.
- [ ] Bridge assente produce ERROR leggibile e disabilita azioni dipendenti.
- [ ] Nessun valore CPU/RAM/agent/token simulato.
- [ ] Graph resta visibile durante chat, ricerca e context panel.
- [ ] Pan, zoom, focus e reset rispettano limiti e reduced motion.
- [ ] Chat preserva invio, cancel, history, Quick/Deep, fonti, copy e retry.
- [ ] Settings e reindex preservano gli IPC esistenti.
- [ ] Nessun nuovo canale IPC o dipendenza npm.
- [ ] Un solo RAF del graph; nessun DOM write per frame.
- [ ] Resize non rompe layout né ricrea listener.
- [ ] Navigazione completa da tastiera e focus visibile.
- [ ] Screenshot prima/dopo rende il nuovo renderer immediatamente distinguibile.
- [ ] `npm run check`, `npm test`, `npm run doctor`, `npm run smoke` e `git diff --check` passano.

# 26. Elementi rimandati

Non fanno parte del redesign:

- Three.js o WebGL;
- graph reale derivato dalla vault o dai wikilink;
- embeddings e vector database;
- installazione/configurazione Ollama;
- agenti reali e orchestrazione multi-agent;
- memoria persistente delle conversazioni;
- database applicativo;
- automazioni e scheduler;
- nuovi strumenti/tool execution;
- nuovi servizi backend o canali IPC;
- telemetria CPU/RAM reale.

La separazione `graph-data`/`graph-engine` permette di sostituire dati statici e Canvas 2D in futuro. Le UI Agents, Memory e automazioni devono restare disabilitate o assenti finché i relativi contratti non esistono.
