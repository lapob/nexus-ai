# Flusso RAG attuale

```text
Vault Markdown -> walk incrementale -> frontmatter -> sezioni -> token/embedding -> cache persistente
Domanda -> ricerca lessicale -> fonti -> system prompt -> modello locale -> risposta
```

La modalità deep chiede prima al modello locale fino a tre sotto-query, unisce
i risultati e produce una seconda sintesi. Se il planner fallisce, il sistema
degrada alla ricerca diretta.

Ogni fonte conserva titolo, heading, percorso, stato e area. Le note deprecated
sono escluse; draft e verified ricevono pesi differenti.

L'indicizzazione completa può essere eseguita in un worker; i file invariati
riusano la cache persistente. La ricerca ibrida combina lessicale ed embedding
quando il runtime embedding è disponibile.

## Limiti

- chunk e token della vault restano caricati in memoria;
- parser YAML e Markdown minimale;
- nessun indice full-text su disco per corpus con milioni di record;
- nessuna valutazione automatizzata completa di groundedness o recall.

I corpus enciclopedici massivi devono usare i knowledge pack descritti in
`ENCYCLOPEDIC_KNOWLEDGE.md`, separati dalla vault Obsidian.
