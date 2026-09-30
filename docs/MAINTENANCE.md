# Manutenzione verificabile

## Struttura

`src` contiene il runtime, `src/renderer` l'interfaccia desktop, `android` i client nativi,
`scripts` gli strumenti e `tests` le regressioni. `qa-artifacts` conserva prove locali;
`release`, `release-android` e `release-private` contengono artefatti generati.
Il sito resta nel repository `.SITE`. Non spostare moduli per sola estetica:
prima verificare import, script di build e percorsi di distribuzione.

Riutilizzare questa struttura senza creare checkout o cartelle di lavoro
parallele. `ios` contiene la base sperimentale del client Apple; richiede
compilazione e prove con Xcode prima di una distribuzione. Pubblicare in
`lapob/nexus-ai` soltanto sorgenti e documentazione pertinenti: dati personali,
knowledge operative, credenziali, modelli, dipendenze e build restano esclusi.
Le release binarie verificate usano gli asset GitHub Releases, non la storia Git.

## Fonti grafiche

`config/nexus-design-tokens.json` e la fonte dei colori condivisi.
`node scripts/generate-interaction-contracts.js` genera le variabili CSS desktop e
`NexusColors.java` per i due client Android, insieme ai contratti degli stati.
`npm run interaction:check` rifiuta copie generate non aggiornate. Non modificarle
a mano. La web app legge il fondo direttamente dalla stessa configurazione.
Le varianti di superficie e contrasto non ancora migrate restano esplicite nei client;
questo passaggio non significa che ogni icona, colore o spaziatura sia centralizzato.

## Pulizia

`node scripts/clean-android-releases.js` mostra un piano senza cancellare.
Aggiungere `--apply` applica la rimozione dei soli APK/AAB versionati riconosciuti.
Si conservano gli alias e le due versioni piu recenti di ogni client/formato,
ordinate per versione, non per data. File sconosciuti e collegamenti non vengono eliminati.
I build automatici usano la stessa politica. Prima della pulizia registrare il piano
in CONTINUITA.md. Conservare release correnti, rollback, dati, credenziali e prove utili.
La rigenerazione dei build puo rioccupare spazio: distinguere byte rimossi e saldo netto.

## Valutazioni dei modelli

La voce locale si ricostruisce con `scripts/provision-python-runtime.ps1`,
poi `scripts/provision-neural-voice.ps1 -InstallerPython python` usando un
Python di sviluppo con pip. L'installer pip resta esterno al runtime distribuito.
`-CheckOnly` verifica Python, checksum dei modelli, tutte le versioni delle
dipendenze e gli import senza scaricare o installare. I pin sono in
`config/neural-voice-runtime.json`; `src/voice/neural-worker.py` e sorgente
tracciato, copiato nelle risorse solo durante il packaging.
`npm run voice:evaluate` verifica audio e latenza su sei frasi sintetiche:
non sostituisce l'ascolto umano o il collaudo microfono/eco.

La sintesi pubblica usa istanze distinte da quelle desktop, una coda di
quattro richieste e una richiesta per sessione. Disconnessione, scadenza e
arresto cancellano solo il lavoro posseduto; non attivano un fallback tardivo.
Le capability della voce pubblica verificano la presenza del runtime,
anziche dedurla dalla sola presenza della funzione nel server.

Il valutatore usa un endpoint locale dedicato (default 127.0.0.1:11435),
configurabile con NEXUS_EVALUATION_ENDPOINT. Rifiuta la porta del servizio attivo.
Con il servizio attivo usa CPU e verifica la RAM rispetto alla dimensione dei modelli;
non cambia modello o memoria GPU del servizio per superare un test.
Rilascia il modello di valutazione al termine di ogni confronto.
Il report distingue isolated-cpu da dedicated-runtime: le latenze CPU non sono
confrontabili direttamente con quelle GPU della produzione.
Se mancano risorse, il gate fallisce prima di caricare modelli. Non interpretarlo
come una valutazione qualitativa superata e non chiudere applicazioni dell'utente.

## Verifica offline della web app

`npm run qa:web:offline` avvia un gateway e un browser temporanei isolati dal
servizio attivo. Usa soltanto una bozza e un file sintetici; verifica perdita
rete, allegati, rotazione, riconnessione senza invio automatico e cancellazione
della sessione anonima al reload. Il report resta in `qa-artifacts/web-offline`.
Non modifica la connessione del PC e non chiama il modello di produzione.

`npm run qa:web:history` verifica la cancellazione durante streaming, preparazione
del servizio e generazione immagini. Il trasporto simulato consegna apposta dati
dopo l'annullamento: la pagina deve ignorarli e la domanda successiva deve avere
una cronologia vuota. Usa un browser isolato, senza inferenza o conversazioni reali.

## Stato verificato il 23 settembre 2026

- Backup/ripristino sintetico: superato; non equivale a prova di tutti i dati personali.
- Audit dipendenze npm di produzione: zero vulnerabilita segnalate nel controllo.
- Igiene dei sorgenti: nessun duplicato accidentale identificato dal controllo esistente.
- Firme Windows/Android, firma manifest e feed aggiornamenti: configurazione mancante.
- Prove vocali umane, ripresa upload e verifica completa degli stati UI: restano nel
  programma RIPRESA/ROADMAP; non sono sostituite dall'audit delle dipendenze.

Le versioni e gli esiti aggiornati sono in CONTINUITA.md nella radice del progetto.
