# Knowledge enciclopedica scalabile

## Obiettivo

Fornire a NEXUSNXS milioni di record consultabili senza trasformare la vault
Obsidian in milioni di file e senza caricare tutto in RAM all'avvio.

```text
.knowledge-private → manuale personale di informatica, sviluppo e cybersecurity
.knowledge-public  → enciclopedia multidisciplinare pubblica e sanitizzata
.knowledge-data    → dump, pack normalizzati e indici su disco
```

## Profili

- **Knowledge privata IT:** documentazione tecnica primaria, laboratori
  autorizzati, esempi, strumenti e procedure personali; non include cultura
  generale.
- **Enciclopedia pubblica:** cultura generale multidisciplinare, alfabetizzazione
  digitale e fondamenti tecnici sanitizzati, senza inventari o note private.
- **Bilingue:** aggiunge corpus inglesi e richiede più storage e indicizzazione.
- **Ricerca:** aggiunge subset Wikidata e OpenAlex; non usa i dump completi sul
  profilo standard.

## Pipeline

```text
manifest → download riprendibile → hash/licenza → parser streaming
→ pulizia → record canonici → deduplica → indice full-text su disco
→ embeddings opzionali → ricerca ibrida → citazione
```

Ogni record conserva fonte, URL, licenza, revisione, lingua e hash. Import e
aggiornamenti sono atomici e reversibili. Common Crawl è escluso per default:
è multi-petabyte e i contenuti conservano diritti e termini dei siti originari.

## Passo tecnico necessario

Il `NexusIndex` attuale mantiene chunk e token in RAM. Prima di importare milioni
di record deve essere affiancato da SQLite FTS o un indice equivalente su disco,
con parser streaming, checkpoint e query paginata.

## Piano

```powershell
npm run knowledge:plan
npm run knowledge:plan -- wikipedia-it wiktionary-it
```

Il comando valida fonti e licenze senza consumare banda o spazio.

## Manutenzione locale

```powershell
npm run knowledge:refresh
```

Il comando aggiorna l'inventario degli strumenti portatili, rigenera l'indice
per materia, valida struttura e metadati e infine esegue il benchmark di
retrieval. Nell'app la stessa manutenzione ordinaria è esposta come **Aggiorna
conoscenza**, senza richiedere all'utente di conoscere script o cartelle.

La vault privata usa un solo perimetro specialistico: informatica,
programmazione, sistemi, reti, AI e cybersecurity. I capitoli sono collegati con
il percorso operativo concetto → tecnologia → strumento → procedura →
laboratorio → evidenza. La cultura generale appartiene esclusivamente alla vault
pubblica multidisciplinare.

L'inventario descrive capacità e prerequisiti, ma non trasforma la semplice
presenza di un eseguibile in una garanzia di disponibilità o autorizzazione.

## Formato ibrido adottato

Le note Markdown restano la fonte autorevole perché sono leggibili, collegabili,
versionabili e modificabili senza dipendere da un database. Il comando
`npm run knowledge:catalog` genera nella cartella privata `.nexus` due viste
derivate:

- `knowledge-catalog.json`, catalogo completo per diagnostica e applicazioni;
- `knowledge-records.jsonl`, un record per nota adatto a import, embedding e
  migrazioni future verso SQLite FTS o un vector database.
- `knowledge.sqlite`, database SQLite FTS5 locale per ricerca full-text veloce;
- `knowledge-graph.json`, grafo dei collegamenti tra concetti e documenti.

Il catalogo registra hash, metadati, titoli, sezioni, link, URL, linguaggi degli
esempi di codice e allegati. Immagini, PDF, audio e video restano file separati:
il database conserva riferimenti e checksum, evitando blob opachi e duplicati.

La vault `.knowledge-public` è la fonte autorevole della distribuzione: non è
generata dalla knowledge privata. `npm run knowledge:publish` la normalizza,
ricontrolla e produce `knowledge-packs/core`, escludendo configurazione Obsidian,
cache e tooling editoriale. La pubblicazione fallisce in presenza di chiavi,
token credibili o percorsi riconducibili al computer di sviluppo.

## Governance verificabile

Il catalogo schema 2 conserva per ogni nota:

- hash del documento e del solo contenuto;
- provenienza e licenza effettive, senza attribuire licenze alle pagine esterne;
- trust tier conservativo, data di verifica e scadenza editoriale;
- URL delle fonti e chiave di citazione stabile;
- relazioni, allegati e relativi checksum.

`npm run knowledge:governance` blocca revisioni scadute, duplicati interni,
claim strutturati incompatibili, riferimenti di supersessione irrisolti e dati
privati nella vault pubblica. Le somiglianze con le schede generate
dell'inventario non sono considerate duplicati editoriali. La fondazione
tecnica eventualmente condivisa tra le due vault viene misurata, mentre
inventari e osservazioni della workstation restano esclusivamente privati.

`npm run knowledge:benchmark:gate` e `npm run knowledge:benchmark:public`
misurano Hit@K, MRR e prontezza delle citazioni. I casi pubblici richiedono anche
una sezione di fonti con URL pertinente. Le metriche sono gate di regressione,
non una dichiarazione che ogni affermazione della raccolta sia vera.

## Roadmap multimodale con diritti chiari

1. accettare soltanto asset originali, autorizzati o con licenza compatibile;
2. generare sidecar con autore, origine, licenza, hash, lingua, alt text e data;
3. rimuovere EXIF e informazioni personali prima di creare il pack pubblico;
4. verificare OCR e trascrizioni, conservando confidenza e versione del motore;
5. indicizzare testo, didascalie e trascrizioni senza inserire blob nel database;
6. introdurre un benchmark multimodale prima di attivare ricerca o reranking.

Non sono previsti scraping web massivo, copie di manuali protetti o immagini
sintetiche presentate come schermate reali.
