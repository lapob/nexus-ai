# Stabilizzazione: evidenze e lavoro residuo

Aggiornamento: 21 settembre 2026. Non e una dichiarazione di prontezza commerciale.
Il checkpoint operativo, commit e hash sono in `../CONTINUITA.md` dalla radice del repository.

| Area | Verificato | Residuo |
| --- | --- | --- |
| Componenti condivisi | Stati generati da `config/nexus-interaction-states.json`, Core condivisi, asset di marchio verificati da `config/brand-assets.json`, movimento Android condiviso | Colori e icone delle superfici conservano ancora definizioni locali. Migrazione progressiva ai token, con confronto visivo: non sono tutti unificati |
| Pulizia | Politica dry-run, due versioni per client/formato, alias e file sconosciuti conservati; igiene di 830 file e 276 moduli senza duplicati accidentali rilevati | Il controllo delle copie non dimostra che ogni componente o dipendenza sia utilizzato. Nessuna rimozione speculativa di asset, dati o modelli |
| Repository | Sorgenti, strumenti, prove e output distinti; mappa in MAINTENANCE.md | Le versioni dei client restano indipendenti nei manifest nativi. Non confondere una versione unica con una distribuzione coordinata |
| Continuita | Control salva sezione, cartella e offset in dp; riapertura reale dopo arresto processo: stesso contenuto, scarto 1px. Le conferme sensibili non sono salvate | Bozze e conversazioni hanno percorsi gia esistenti, ma manca una matrice completa di tutti i client dopo rotazione/rete/process death |
| Grafica | Corrette collisioni avviso voce/dock a 360x420 e 768x1024; 11 viewport web PASS. Control: contrasto sotto status bar, righe verticali per font grande, cinque profili fisici PASS | Matrice completa di tutti gli stati desktop/pubblico Android e tutte le lingue da completare |
| Voce/allegati | 52 test gateway, incluso upload HTTP interrotto a meta, retry integro e deduplicato; sessione vocale e sintesi automatica PASS | Eco e interruzione con voce umana richiesti al proprietario. Il test HTTP usa un file sintetico reale su disco; non simula ogni browser o la perdita completa della pagina |
| Operativita | verify:experience PASS su endpoint CPU dedicato: 8B 94%, 14B 100% nel set breve; smoke, shutdown e soak 250 PASS | Non e prova di disponibilita continua o equivalenza con modelli commerciali. Latenza CPU distinta dalla produzione GPU |
| Distribuzione | Build/lint Control e verifiche automatiche di integrita/rollout PASS; rollback APK conservato | Certificati Windows/Android, chiavi manifest e feed aggiornamenti non configurati. Installazione e rollback firmati su macchina pulita ancora necessari |

## Regole di chiusura

- Non marcare l'intero programma concluso sulla base di questa sessione.
- Conservare le copie di asset richieste dai packaging: sono derivate intenzionali.
- Non salvare ticket di azioni, consensi o conferme di alimentazione nella navigazione.
- Non pubblicare la Control privata nella release pubblica.
- Non trasformare un test sintetico di voce in una prova di eco reale.
- Non cambiare soglie AI o requisiti di firma per rendere verde un controllo.

Prove locali: `qa-artifacts/continuity-*`, `control1193-*`, `web-bottom-bar`.
Prossimo blocco: confronto componenti/token per singola superficie, matrice di
continuita dei client restanti, prova vocale umana e configurazione sicura delle firme.
