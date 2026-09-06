# Verifica del progetto — 6 settembre 2026

## Risultati verificati

- Due APK Preview installati tramite aggiornamento su dispositivo fisico, senza cancellare i dati.
- Matrice Android Public e Control: cinque profili per client, compresi font 200%, landscape e tablet. Budget jank del 18% rispettato; dimensioni, densità e font originali ripristinati.
- Control: riconnessione privata osservata, servizi e metriche in tempo reale visibili. Le catture iniziali offline non dimostravano un guasto permanente. Matrice Control ripetuta dopo la riconnessione.
- `verify:experience`: valutazioni reali qwen3:8b e qwen3:14b, sintesi vocale, Electron smoke, chiusura e 250 cicli; zero richieste orfane.
- `security:regression`: 130 test superati.
- `backup:drill`: quattro file sintetici ripristinati, integrità e cifratura verificate.
- `load:gateway`: 20 client HTTP isolati, 7 richieste servite e 13 respinte dal controllo di sovraccarico; p95 302 ms. Il backend di questo test è sintetico: non misura la capacità di inferenza AI pubblica.
- SLO aggiornati: 8 controlli conformi, nessuno fuori soglia. Disponibilità continua non ancora misurata sul periodo richiesto.

## Correzione dei controlli di release

Stable accetta ora `CapturedAt` prodotto da PowerShell, come Founder Beta. Ogni controllo automatico include percorso, timestamp, età e limite di freschezza; prove future o scadute restano bloccate. Test di regressione dedicato superato.

## Limiti residui

Stable resta bloccata da firma Windows, keystore Android di produzione, firma dei manifest e origine degli aggiornamenti; nessuna credenziale è stata inventata. Restano da documentare copia offsite, UPS, failover di rete, rotazione chiavi, installazione e aggiornamento su Windows pulito, prova di incidente e verifica indipendente di sicurezza.

La matrice di layout non certifica riconoscimento vocale in ambienti rumorosi, qualità di microfoni diversi o percorsi completi di tastiera e conversazione. Questi punti richiedono evidenze dedicate; i test sintetici non li sostituiscono.

I risultati dettagliati sono negli artefatti locali `qa-artifacts`: `android-device-current.log`, `current-control-connected.log`, `current-experience.log`, `current-security.log`, `product-slo-report.json`, `stable-release-readiness.json` e i manifest delle due matrici Android. Gli artefatti operativi restano fuori dalla documentazione pubblica.
