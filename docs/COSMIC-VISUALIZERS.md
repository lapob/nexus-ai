# Scena condivisa Android e web

I tre visualizer pubblici sono ora derivati dai Core desktop: `neural`,
`jarvis-reactor`, `saturn-experimental`. I sorgenti desktop e Presence non sono
stati modificati. Il precedente Core Android a nastri è stato eliminato,
insieme alle decorazioni VoiceAura e VoiceWaveform obsolete.

`scripts/generate-cosmic-visualizers.js` estrae le geometrie deterministiche,
gli shader neurale/Saturno e i profili di stato dai sorgenti desktop. Genera
`src/shared/desktop-recipes.js` e l'asset Android locale. `--check`, incluso
nei controlli del progetto e nella build Android, blocca asset divergenti.
Il reattore riutilizza tutte e quattro le geometrie desktop; il materiale
puntiforme e le trasformazioni sono adattati al renderer WebGL leggero.

La selezione casuale visita tutti e tre i preset senza ripetizioni consecutive.
Dopo 24–36 secondi di quiete, la materia si disperde in 3,2 secondi e si
ricompone in 3,8 secondi. Le stelle di fondo restano presenti. La transizione
successiva attende il termine dell'interazione; non viene avviata mentre
si parla, si ascolta o si trascina. Movimento ridotto conserva un preset
statico. Voce e stato arrivano dal client reale, senza simulare risultati AI.

La scena Android è un asset locale in una superficie WebView trasparente,
mentre interfaccia, accessibilità, voce e conversazioni restano Compose/native.
Non ha bridge JavaScript, accesso a file/contenuti, storage DOM o rete; gli
aggiornamenti sono JSON prodotti dal client. Il lifecycle sospende la scena
in background e distrugge le risorse alla chiusura. Il Core principale occupa
la scena completa, gli overlay mantengono una superficie locale indipendente.

## Verifica dell'8 settembre 2026

- 848 test completi superati; dopo le ultime correzioni grafiche, 54 test
  pertinenti superati. Build/typecheck e `verify:experience` completi superati:
  AI, voce, Electron, shutdown e 250 cicli senza richieste orfane.
- Desktop: catture `neural`, `jarvis`, `saturn` eseguite e ispezionate.
- Browser: tre preset a 390 e 1280 px, WebGL effettivo senza fallback, nessun
  errore JS o overflow. Campioni di 180 frame: p95 16,7–16,8 ms, zero intervalli
  sopra 50 ms; misure sul browser della workstation, non sul telefono.
- Asset Android verificato separatamente nel browser. Build Preview 6.5.0,
  lint e firma APK verificati. Non equivale a una prova Android reale.
- ADB non rileva dispositivi né servizi mDNS; installazione e prove native
  su telefono, inclusi IME, overlay e ritorno dal background, restano pendenti.
  L'APK non è stato promosso come aggiornamento pubblico verificato.

Evidenze locali: `cosmic-final-browser.json`, `cosmic-tests-final.log`,
`cosmic-final-targeted.log`, `cosmic-experience.log`, `cosmic-android-verified.log`.
