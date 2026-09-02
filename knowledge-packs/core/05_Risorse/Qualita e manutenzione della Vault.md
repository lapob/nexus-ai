---
title: Qualità e manutenzione della Vault
type: guide
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-23
source_kind: curated
tags: [knowledge-management, quality, maintenance, rag]
aliases: [Manutenzione Nexus]
---

# Qualità e manutenzione della Vault

## Controlli minimi

- ogni nota ha un solo titolo H1 e frontmatter valido;
- `type`, `area`, `status`, `created`, `updated`, `source_kind`, `tags` e `aliases` sono presenti;
- i wikilink puntano a note esistenti e usano un percorso quando il titolo è ambiguo;
- le sezioni vuote appartengono soltanto a template, inbox o note marcate `draft`;
- fatti mutevoli e procedure sensibili riportano fonte, versione e data di verifica;
- note duplicate indicano chiaramente quale sia la pagina canonica;
- segreti, dati personali superflui e output sensibili non entrano nell'indice RAG.

## Stati

- `draft`: struttura incompleta, appunti o contenuto ancora da verificare;
- `verified`: verificato contro una fonte o con una prova riproducibile;
- `evergreen`: guida interna stabile e mantenuta;
- `deprecated`: conservato per storia, con collegamento al successore.

Lo stato descrive l'affidabilità, non la quantità di testo. Una nota lunga ma senza provenienza può restare `draft`.

## Revisione periodica

1. rivedere note con `review_after` scaduto o informazioni dipendenti da versioni;
2. completare prima le bozze richieste da progetti o domande reali;
3. controllare link, duplicati e titoli ambigui;
4. verificare fonti e aggiornare lo stato;
5. rigenerare indice, catalogo, grafo e database di ricerca.

## Audit automatico

La pipeline editoriale dei manutentori verifica struttura, metadati, H1, duplicati, allegati, wikilink, segreti e percorsi privati prima di creare il pacchetto. Il lettore riceve soltanto note e indici derivati: tooling, configurazione editoriale e inventari locali restano esclusi.

Il benchmark misura Hit@K, MRR e completezza dei riferimenti restituiti. I casi pubblici richiedono una sezione fonti con almeno un URL istituzionale o accademico pertinente. Il gate di governance registra hash, provenienza e trust tier, rileva revisioni scadute e confronta claim strutturati; non inventa contraddizioni analizzando frasi fuori contesto.

## Criterio di completamento

Una nota è pronta per il retrieval quando risponde a una domanda riconoscibile, è comprensibile fuori dal proprio percorso, distingue fatti da opinioni e permette di risalire alla provenienza delle affermazioni importanti.
