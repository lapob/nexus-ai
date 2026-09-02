---
title: Pattern di progetto e debugging
type: reference
area: development
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [architecture, debugging, testing, examples, visual]
aliases: [Debugging, Pattern di progetto]
---

# Pattern di progetto e debugging

## Struttura applicativa minima

```mermaid
flowchart LR
    UI["CLI/UI/API"] --> APP["Application service"]
    APP --> DOMAIN["Logica di dominio"]
    APP --> PORT["Interfacce/porte"]
    PORT --> DB["Database adapter"]
    PORT --> HTTP["HTTP adapter"]
    PORT --> FS["Filesystem adapter"]
    APP --> OBS["Log, metriche e trace"]
```

La logica di dominio non dovrebbe dipendere direttamente da UI, database o rete. I confini diventano sostituibili e testabili.

## Pipeline input-output

```mermaid
flowchart LR
    I["Input non fidato"] --> L["Limiti dimensione/rate"]
    L --> P["Parsing"]
    P --> V["Validazione semantica"]
    V --> D["Dominio"]
    D --> A["Autorizzazione"]
    A --> E["Effetto"]
    E --> O["Output encoding"]
    E --> LOG["Audit minimizzato"]
```

## Debugging scientifico

```mermaid
flowchart TD
    S["Sintomo riproducibile"] --> M["Minimizza il caso"]
    M --> H["Formula una sola ipotesi"]
    H --> O["Aggiungi osservazione"]
    O --> T["Esegui test controllato"]
    T --> R{"Ipotesi confermata?"}
    R -- "No" --> H
    R -- "Sì" --> F["Correggi la causa"]
    F --> G["Regression test"]
    G --> V["Verifica sistema completo"]
```

## Checklist del bug report

- ambiente, versione e configurazione;
- input minimo;
- risultato atteso e osservato;
- timestamp e correlation ID;
- stack trace/log minimizzati;
- frequenza;
- ultimo stato noto funzionante;
- workaround e impatto.

## Test per livello

| Livello | Cosa protegge | Esempio |
|---|---|---|
| unit | regole locali | normalizzazione e calcolo |
| property/fuzz | invarianti e input ampio | parser non va in crash |
| integration | confini | database, file, API |
| contract | compatibilità | schema request/response |
| end-to-end | percorso critico | login → azione → audit |
| security | abuso e trust boundary | authz, injection, rate |

## Error handling

Un errore utile contiene operazione, risorsa non sensibile, causa e azione successiva. L'utente vede un messaggio stabile; log interni possono avere dettagli, ma non segreti.

```text
Codice: CONFIG_NOT_FOUND
Messaggio utente: configurazione non disponibile
Contesto log: file atteso, ambiente, correlation ID
Recovery: crea configurazione o seleziona profilo
```

## Osservabilità

```mermaid
flowchart LR
    EVT["Evento"] --> LOG["Log: cosa è successo"]
    EVT --> MET["Metrica: quanto/spesso"]
    EVT --> TR["Trace: dove ha viaggiato"]
    LOG --> CORR["Correlation ID"]
    MET --> CORR
    TR --> CORR
    CORR --> TRI["Triage"]
```

## Collegamenti

- [[Indice - Esempi di programmazione]]
- [[Testing e qualita del software|Testing]]
- [[Sicurezza del software|Sicurezza del software]]
- [[02_Cybersecurity/Fondamenti/Threat Modeling|Threat Modeling]]
