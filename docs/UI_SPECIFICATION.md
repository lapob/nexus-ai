# NEXUSNXS — UI Specification

Stato: implementata
Target: Electron, React, TypeScript, React Three Fiber, WebGL

## Idea

NEXUSNXS non è una dashboard. È una presenza digitale quasi completamente nera.
Il visualizer particellare è il protagonista; il testo racconta solo ciò che
l'AI sta facendo in quel momento.

## Regola permanente

L'interfaccia ordinaria parla per obiettivi e decisioni, non per dettagli di implementazione. IP, porte, hash, endpoint, identificatori runtime, memoria hardware, backend e diagnostica restano nei log e nella documentazione sviluppatore. Le superfici utente usano espressioni comprensibili come “Usa dal telefono”, “Da fuori casa” e “Collega telefono”. Un dato tecnico compare soltanto quando è indispensabile per completare manualmente un'operazione, accompagnato da una spiegazione semplice.

NEXUSNXS non usa header, navbar o dashboard tradizionali. Ogni superficie è
temporanea, contestuale e priva di chrome decorativo. Un controllo compare solo
quando consente un'azione utile; le impostazioni automatiche non espongono
diagnostica tecnica e le funzioni avanzate restano progressive. Titolo, stato e
azione non devono mai ripetere la stessa informazione.

La gerarchia obbligatoria è: presenza → contenuto → azione. Pannelli, linee,
icone ambigue e contenitori annidati sono regressioni visive da respingere in QA.

## Composizione

```text
┌──── contesto ~20% ────┬──────────── presenza GPU ~80% ────────────┐
│ NEXUSNXS                 │                                            │
│ Status                │      materia particellare asimmetrica      │
│ Current task          │      guidata da audio e stato cognitivo    │
│ Live log              │                                            │
│ You / NEXUSNXS           │                                            │
└───────────────────────┴────────────────────────────────────────────┘
```

La colonna contiene soltanto il controllo necessario `Voice on/off`. `Space`
attiva o ferma una singola acquisizione, `V` abilita o disabilita il
riconoscimento, `Ctrl+K` apre l'input testuale e `Ctrl+,` apre la configurazione
locale. La selezione dei modelli ufficiali NEXUSNXS è disponibile con `Ctrl+M`.

## Sistema visivo

- fondo `#020405`;
- testo ghiaccio, secondari cyan desaturati;
- nessun rosso, verde, giallo, arancione, viola o magenta;
- Inter Variable incluso nel bundle per la UI, JetBrains Mono Variable per log e scorciatoie;
- separatori a un pixel e glow molto debole;
- nessuna card permanente, nessun dato hardware decorativo.

Il marchio NEXUSNXS usa filamenti organici ghiaccio, cyan e teal su antracite. La
geometria resta originale: richiama il linguaggio dei prodotti AI contemporanei
senza replicare marchi esistenti. Su Windows la title bar usa un overlay Electron
nero con controlli color ghiaccio, eliminando la barra blu nativa.

## Presenza particellare

`ParticleEngine.tsx` usa un solo draw call GPU e fino a 1.050.000 punti,
adattando il conteggio a viewport e core disponibili. La geometria è un tessuto
orizzontale piegato e asimmetrico: non forma sfere, cervelli o cerchi.

| Stato | Comportamento |
|---|---|
| idle/offline | respirazione lenta e deriva minima |
| listening | increspature leggere |
| speaking | compressione, espansione e turbolenza guidate dallo spettro |
| thinking | convergenza densa verso una piega mobile |
| responding | onde armoniche più ampie |
| executing | impulsi direzionali |

## Responsive e accessibilità

- colonna al 20% sulle viewport ampie;
- scala tipografica e densità particelle adattive;
- log compattati in altezza ridotta e nascosti solo sotto `620px`;
- regioni live per stato e risposta;
- focus testuale visibile e supporto `prefers-reduced-motion`;
- fallback essenziale se WebGL non è disponibile.

### Superfici Android edge-to-edge

Entrambi i client Android applicano `NexusSystemBars` come unica policy. Status
bar e navigation bar non sono pannelli neri separati: il contenuto occupa la
finestra edge-to-edge e rimane visibile attraverso un velo cosmico traslucido.
Le safe area proteggono il contenuto a riposo; nelle superfici scorrevoli il
padding appartiene allo scroller con clipping disattivato, così gli elementi in
movimento passano dietro le barre senza diventare obiettivi tattili coperti. Le
icone di sistema restano chiare, il divisore della navigation bar è trasparente
e le API non disponibili su Android 8 vengono applicate solo sulle versioni che
le supportano. Barre opache, nero puro e inset applicati all'intera finestra
sono regressioni bloccate dai test Android.

NexusNXS Control aggiunge due sole fasce frosted-glass: Android 12 e successivi
sfocano realmente il contenuto sotto status e navigation bar, mentre Android 8–11
usano lo stesso gradiente traslucido come fallback. Il resto della schermata non
viene ricomposto o sfocato, così il contrasto cresce senza gravare sui frame.

## QA minimo

```powershell
npm run typecheck
npm run build:renderer
npm run smoke
```

Il controllo visivo copre almeno `1440×900` e `900×650`.

## Revisione grafica dell 11 ottobre 2026

Catture osservate di home e web app a320/390/844/1440/2560px, con impostazioni e composer:26 schermate, nessun overflow orizzontale o eccezione JavaScript. Sito osservato in produzione; web app con sorgenti e risposte di servizio sintetiche. Desktop: tre Core, pointer, fullscreen e transizioni full/reduced passano; cinque superfici a scale100/200 producono dieci catture valide. Queste prove non sostituiscono telefono, macOS, Linux o iOS reali.

Correzioni: rimossa dal sito la vecchia dimensione16px imposta ai figli del pulsante, responsabile della scritta su due righe a320px. Il test verifica riga singola, centratura testo/icona e allineamento verticale a sette larghezze e tre scroll. Le note e descrizioni desktop riusano il token mist opaco: maggiore leggibilita senza nuovi colori o font. Il contrasto stimato della descrizione sul fondo#030A0B passa da3.68:1 a9.95:1; e una stima sul fondo specificato, non una misura di tutti i pixel. Axe non rileva violazioni nella vista settings, ma lascia un controllo incompleto sulle trasparenze.

Il misuratore web legge ora renderer() e il delta di draws, anziche serializzare funzioni vuote. Il gate rifiuta metriche mancanti/nonfinite e un Core fermo anche con rAF veloce; regressione dedicata verificata. Il campione headless della workstation ha p95rAF4.3ms e zero intervalli lunghi, su Coredesktop42.000punti e mobile96.000punti. Non e una prova di240fps su smartphone ne una misura del completamento GPU. Il cleanup motion riusa il retry del profilo esclusivo dopo la chiusura di Chromium.

Perfezionamenti proposti, non ancora consegnati: usare tracce GPU/energia su telefoni reali a60/90/120Hz per scegliere una cadenza stabile; affinare la continuita luminosa fra ascolto, interruzione e ritorno al testo dopo le prove vocali umane; mostrare le fasi reali dei job immagini/strumenti con lo stesso linguaggio della materia, senza percentuali inventate; verificare contrasto e blur con contenuti chiari/scuri lunghi e lightbox su dispositivi fisici. Privilegiare ritmo, chiarezza e continuita, senza moltiplicare glow, pannelli o loop decorativi.
