# Storage infrastructure

Adapter per percorsi portabili e dati locali del sistema operativo.

`portable-paths.js` separa la vault scelta dall'utente, i dati applicativi e la
directory di installazione.

Gli archivi SQLite condividono le regole di `sqlite-durability.js`: WAL,
attesa sui lock, sincronizzazione completa, `quick_check` e checkpoint alla
chiusura. `version-snapshot.js` produce copie autonome con `VACUUM INTO`, le
verifica in staging e pubblica soltanto directory complete tramite rename.
