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

## Chiusura web

Pubblicato il Worker `321cc589-75a0-429f-80c6-a1b1079c4bfe` dal commit sito
`af92e9b`: 34 test unitari, 23 browser e 14 percorsi pubblici verificati.
Richiesta AI pubblica reale di solo totale 7 + 5: `12`. Perdita e ripristino
del contesto GPU provati nel browser senza errori. Corretta una collisione
del titolo con i controlli a 844x390; ispezionati anche 390x568 e la risposta.
Il primo candidato era stato bloccato da un 503 durante il riavvio del servizio;
la verifica successiva è stata completata prima della promozione.

Preview Android finale: SHA-256
`21B909B6AAB1F6217CE86D3AF07C22DE59429A06C0A00982DF8A1056961C7506`.
Include ricreazione della scena locale in caso di perdita del processo grafico.
Build e lint passati; le prove sul dispositivo e la promozione APK restano aperte.

## Revisione delle proporzioni e pulizia

Saturno a riposo usa un'inquadratura più ampia, raccordata gradualmente
all'apertura degli anelli tramite lo stesso clock. Geometrie e visualizer
desktop restano invariati. Nel fallback software la scena nascosta viene
svuotata, con la stessa scala e orientamento dei livelli GPU; il movimento
ridotto applica subito lo stato stabile degli anelli.

Verifica browser: tre preset a 390 e 1280 px, p95 16,7–16,8 ms e nessun
intervallo oltre 50 ms nei campioni. Controllate anche le nove combinazioni
320x568, 390x568 e 844x390; nessun overflow orizzontale o errore JavaScript.
Il fallback senza WebGL è stato provato mostrando e nascondendo il Core,
verificando i pixel del canvas. Sono misure della workstation, non Android.

Preview Android 6.5.0 ricompilata dopo la pulizia della UI legacy e gli
aggiustamenti condivisi, SHA-256:
`801984FC518BA8F3EDE36FEC90E4392350940BE9C2C66A0FA57753E756B30828`.
Sostituisce la precedente build locale della stessa Preview; non è promossa.
