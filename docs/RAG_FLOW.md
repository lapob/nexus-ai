# Flusso RAG attuale

```text
Vault Markdown -> walk -> frontmatter -> sezioni -> token -> indice in memoria
Domanda -> ricerca lessicale -> fonti -> system prompt -> modello locale -> risposta
```

La modalità deep chiede prima al modello locale fino a tre sotto-query, unisce
i risultati e produce una seconda sintesi. Se il planner fallisce, il sistema
degrada alla ricerca diretta.

Ogni fonte conserva titolo, heading, percorso, stato e area. Le note deprecated
sono escluse; draft e verified ricevono pesi differenti.

## Limiti

- rebuild completo e sincrono;
- parser YAML e Markdown minimale;
- assenza di embeddings, indice persistente e reranking;
- nessuna valutazione automatizzata di groundedness o recall.

