# Manutenzione verificabile

## Struttura

`src` contiene il runtime, `src/renderer` l'interfaccia desktop, `android` i client nativi,
`scripts` gli strumenti e `tests` le regressioni. `qa-artifacts` conserva prove locali;
`release`, `release-android` e `release-private` contengono artefatti generati.
Il sito resta nel repository `.SITE`. Non spostare moduli per sola estetica:
prima verificare import, script di build e percorsi di distribuzione.

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

## Stato verificato il 23 settembre 2026

- Backup/ripristino sintetico: superato; non equivale a prova di tutti i dati personali.
- Audit dipendenze npm di produzione: zero vulnerabilita segnalate nel controllo.
- Igiene dei sorgenti: nessun duplicato accidentale identificato dal controllo esistente.
- Firme Windows/Android, firma manifest e feed aggiornamenti: configurazione mancante.
- Prove vocali umane, ripresa upload e verifica completa degli stati UI: restano nel
  programma RIPRESA/ROADMAP; non sono sostituite dall'audit delle dipendenze.

Le versioni e gli esiti aggiornati sono in CONTINUITA.md nella radice del progetto.
