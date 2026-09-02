# Verifica obbligatoria dell'esperienza

La qualità di NEXUSNXS non viene valutata soltanto dalla compilazione. Ogni ciclo di modifica termina con un controllo congiunto dell'intelligenza, della voce e dell'applicazione reale.

```powershell
npm run verify:experience
```

Il comando prepara l'ambiente e avvia il motore locale, valuta i modelli destinati all'uso automatico, genera campioni vocali validi con la voce neurale locale, avvia uno smoke test Electron completo e conclude con 250 cicli di stabilità. Se una fase fallisce, l'intera verifica fallisce.

Prima di creare gli artefatti destinati alla distribuzione eseguire inoltre
`npm run release:preflight`. Il comando unisce verifica completa, carico del
gateway e accessibilità delle superfici principali,
scaling visivo e sicurezza della pubblicazione. Non richiede le credenziali di
firma; il successivo `npm run release:check:production` le considera invece
obbligatorie.

`npm run verify` include questo controllo insieme a test, build, sicurezza e igiene del progetto. Le modifiche al riconoscimento vocale richiedono anche un corpus registrato sul dispositivo interessato:

```powershell
npm run voice:evaluate:stt -- --dataset=<percorso-del-dataset.json>
```

I risultati ripetibili vengono salvati in `qa-artifacts/`; non sono mostrati nell'interfaccia ordinaria.
