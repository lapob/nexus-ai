# Knowledge

Il dominio knowledge contiene indicizzazione, chunking e retrieval della vault.

- `rag.js` applica le policy di inclusione e costruisce l'indice locale;
- nessun file della vault viene copiato nel codice sorgente o nel pacchetto.
- `scripts/build-knowledge-catalog.js` produce record JSON/JSONL derivati con
  provenienza, relazioni, esempi e allegati, senza sostituire i documenti fonte.
- `scripts/audit-knowledge-governance.js` verifica freshness, trust tier,
  licenze, hash, duplicati, claim espliciti e confine pubblico/privato;
- il benchmark produce Hit@K, MRR e coverage delle citazioni e delle fonti.

Il modello consigliato è ibrido: Markdown e asset come sorgenti autorevoli,
catalogo strutturato per query e audit, indice RAG rigenerabile per il runtime.
Immagini, PDF, audio e video rimangono asset separati con checksum, licenza,
testo alternativo o trascrizione: il progetto non importa media dal web in modo
massivo e non incorpora contenuti protetti nel database.
