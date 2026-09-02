---
title: Knowledge engineering: fonti, retrieval e governance
type: professional-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-08-15
updated: 2026-08-15
source_kind: curated-synthesis
tags: [knowledge-engineering, rag, retrieval, governance, provenance]
aliases: [Knowledge engineering, Architettura della knowledge AI]
---

# Knowledge engineering: fonti, retrieval e governance

## Principio

La knowledge di un sistema AI non è un unico archivio. È un insieme governato di fonti con autorità, frequenza di aggiornamento, livello di accesso e strategia di recupero differenti.

## Quattro livelli

| Livello | Contenuto | Aggiornamento | Esempio |
|---|---|---|---|
| conoscenza parametrica | pattern appresi durante training o fine-tuning | lento e costoso | lingua, concetti generali |
| knowledge versionata | documenti curati e indicizzati | controllato | manuali, policy, runbook |
| dati operativi | stato corrente dei sistemi | continuo | inventario, incidenti, metriche |
| web e fonti esterne | informazioni recenti o non possedute | al bisogno | documentazione ufficiale, notizie |

Il modello non deve inventare dati correnti partendo dalla sola conoscenza parametrica. Il retrieval non deve trasformare una nota non verificata in un fatto.

## Pipeline documentale

1. acquisire da una fonte autorizzata;
2. conservare titolo, autore, data, versione e licenza;
3. normalizzare formato e codifica;
4. classificare dominio, sensibilità e affidabilità;
5. segmentare rispettando sezioni e unità logiche;
6. indicizzare testo e, quando utile, embedding;
7. valutare query reali con un benchmark ripetibile;
8. revisionare, ritirare o sostituire contenuti obsoleti.

## Retrieval ibrido

La ricerca lessicale è forte su comandi, codici errore, nomi propri e versioni. La ricerca semantica è forte su parafrasi e concetti. Un sistema robusto combina entrambe, applica filtri di accesso prima del ranking e diversifica i risultati per evitare cinque frammenti quasi identici della stessa nota.

Il contesto finale deve avere un budget. Più testo non equivale a più precisione: contenuti ridondanti o deboli possono distrarre il modello.

## Provenienza invisibile ma verificabile

Per una UI pubblica si possono nascondere percorsi interni e nomi della workstation, mantenendo nel backend:

- identificativo documento e versione;
- hash del contenuto;
- timestamp di indicizzazione;
- classificazione della fonte;
- motivazione del recupero;
- audit dell'accesso.

La provenienza tecnica resta così disponibile agli amministratori senza esporre dettagli privati all'utente finale.

## Knowledge privata e pubblica

Separare fisicamente e logicamente:

- knowledge pubblica del prodotto;
- dati personali del singolo utente;
- documenti operativi interni;
- segreti e credenziali, che non devono entrare nella knowledge;
- dataset di valutazione e training.

Ogni richiesta attraversa un filtro di autorizzazione prima del retrieval. Una sessione guest non deve poter recuperare la knowledge privata del proprietario anche se il prompt la richiede esplicitamente.

## Uso del web

Il web è adatto quando l'informazione è recente, esterna o richiede una fonte primaria aggiornata. La ricerca deve privilegiare documentazione ufficiale, standard, paper e vendor responsabili. Conservare URL, data di accesso e distinzione tra citazione e inferenza.

Non usare il web come sostituto automatico di una base curata: latenza, disponibilità, qualità, licenze e prompt injection rendono necessarie policy e validazione.

## Valutazione

Costruire un insieme di domande rappresentative con documenti attesi. Misurare:

- Hit@K e MRR del retrieval;
- copertura delle fonti rilevanti;
- accuratezza e completezza della risposta;
- citazioni corrette;
- resistenza a documenti ostili;
- latenza e costo;
- assenza di leakage tra tenant o livelli di accesso.

## Manutenzione

Ogni nota dovrebbe dichiarare stato, livello, data, tipo di fonte, tag e alias. Gli indici descrivono il percorso di studio; i link collegano prerequisiti e approfondimenti. Un controllo automatico rileva link rotti, duplicati, frontmatter incompleto e note orfane.

## Collegamenti

- [[RAG embeddings memoria e knowledge graph]]
- [[MLOps versionamento deployment e monitoraggio]]
- [[Metodo di ricognizione verifica e sintesi]]
- [[Qualita e manutenzione della Vault]]
- [[Privacy engineering e protezione dei dati]]
