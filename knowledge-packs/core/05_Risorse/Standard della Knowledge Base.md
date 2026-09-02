---
title: Standard della Knowledge Base
type: guide
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-07-23
source_kind: curated
tags: [knowledge-management, obsidian, rag]
aliases: []
---

# Standard della Knowledge Base

## Una nota utile alla futura AI

Una nota tratta un argomento riconoscibile, ha un titolo univoco, contesto sufficiente, collegamenti espliciti e separa fatti, esempi, ipotesi e opinioni. Evita pagine enormi e frammenti senza spiegazione.

## Frontmatter consigliato

```yaml
---
type: concept # concept, guide, methodology, lab, project, index, procedure, reference
area: cybersecurity
status: draft # draft, verified, evergreen, deprecated
level: foundation # foundation, intermediate, advanced
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_kind: curated # curated, official-docs, standard, book, course, lab
tags: []
aliases: []
---
```

## Struttura

1. Sintesi in linguaggio naturale
2. Concetti e modello mentale
3. Procedura o esempio riproducibile
4. Limiti, rischi e casi in cui non usarlo
5. Collegamenti correlati
6. Fonti con titolo, URL, autore/ente, data di accesso e versione

## Regole editoriali

- marca l'incertezza: `da verificare`, `ipotesi`, `esperienza personale`
- non copiare segreti, token, credenziali, dati personali o output sensibili
- non importare interi articoli: sintetizza e cita la fonte
- per comandi distruttivi indica prerequisiti, impatto e rollback
- conserva le note obsolete ma marcate `deprecated` con il successore
- aggiorna `updated` dopo una verifica sostanziale, non per modifiche cosmetiche

## Stati dei progetti

`status` descrive l'affidabilità della nota. Per il flusso di un progetto usa un campo separato:

```yaml
status: draft
project_status: active # backlog, planned, active, blocked, completed, cancelled
```

## Dati privati e RAG

Per note professionali o personali sensibili aggiungi:

```yaml
sensitivity: confidential
rag: false
```

`rag: true` deve essere un opt-in esplicito su una singola nota sanitizzata. Non inserire mai segreti, credenziali o dati regolamentati confidando soltanto nell'esclusione dell'indice.
