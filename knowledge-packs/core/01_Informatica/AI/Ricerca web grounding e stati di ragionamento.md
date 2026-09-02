---
title: Ricerca web grounding e stati di ragionamento
type: concept
area: tech
status: evergreen
level: intermediate
visibility: public
created: 2026-08-30
updated: 2026-08-30
source_kind: curated
tags: [ai, agents, search, grounding, citations, evaluation]
aliases: [grounded search, ricerca AI verificabile]
---

# Ricerca web, grounding e stati di ragionamento

## Principio

Un assistente affidabile non interroga il web per ogni domanda. Prima classifica
la richiesta:

1. **stabile:** conoscenza generale che può essere risposta dal modello o dalla
   knowledge curata;
2. **temporale:** prezzi, versioni, norme, ruoli, notizie o altri fatti che
   possono cambiare;
3. **esplicitamente verificata:** l'utente chiede ricerca, fonti o citazioni;
4. **operativa o privata:** riguarda file, dispositivi, allegati, credenziali o
   dati locali e non deve essere trasformata automaticamente in una query web.

La ricerca è necessaria nei casi 2 e 3. Nel caso 4 occorre mantenere il confine
locale, salvo una richiesta pubblica esplicita che non contenga dati sensibili.

## Pipeline di grounded generation

```text
richiesta
  -> classificazione intento e rischio
  -> query minima priva di dati privati
  -> provider di ricerca con timeout e limiti
  -> normalizzazione e deduplicazione
  -> fonti trattate come input non fidato
  -> risposta con citazioni
  -> validazione di lingua, vincoli e copertura
```

Il motore deve registrare provider, durata e numero dei risultati, non la chiave
API e non il contenuto privato dell'utente. Le credenziali restano nel server;
i client ricevono soltanto stati sintetici, token della risposta e fonti
pubbliche. La cache deve essere breve perché una cache lunga può rendere
nuovamente obsoleto un fatto temporale.

## Sicurezza

Una pagina recuperata è un dato, non un'istruzione. Può contenere prompt
injection, testo invisibile, citazioni inventate o richieste di usare altri
strumenti. Perciò:

- limita schema, dimensione e numero dei risultati;
- consenti solo HTTPS e provider esplicitamente approvati;
- non eseguire script, link o istruzioni provenienti dai risultati;
- non lasciare che una fonte autorizzi strumenti o ampli lo scopo;
- cita URL effettivamente restituiti dal provider;
- dichiara l'indisponibilità della ricerca invece di simulare una verifica;
- separa fonti pubbliche da memoria, knowledge privata e output degli strumenti.

## Ragionamento visibile

Gli stati dell'interfaccia devono descrivere lavoro osservabile, per esempio
“confronto quattro fonti” o “verifico il risultato”. Non devono mostrare token
di chain-of-thought o monologhi interni: questi non sono una prova e possono
contenere ipotesi, dati sensibili o passaggi poi scartati. Se serve spiegare una
decisione, il modello produce invece una motivazione breve, verificabile e
scritta appositamente per l'utente.

## Agenti e strumenti

Un agente robusto distingue:

- **strumenti server-side**, eseguiti nell'infrastruttura controllata;
- **strumenti client-side**, eseguiti nel dispositivo con consenso e ricevuta;
- **risultati degli strumenti**, sempre dati non fidati;
- **piano**, che propone il prossimo passo ma non lo autorizza;
- **postcondizione**, che verifica che l'effetto richiesto sia avvenuto.

Ogni passo operativo deve avere scopo limitato, schema validato, timeout,
cancellazione, idempotenza quando possibile e log di audit senza segreti.

## Valutazione

Un benchmark utile include almeno:

| Caso | Esito atteso |
|---|---|
| domanda stabile | nessuna ricerca, bassa latenza |
| fatto attuale | ricerca e citazione vicina al fatto |
| provider offline | avviso esplicito, nessuna fonte inventata |
| risultato con prompt injection | istruzione ignorata |
| query con percorso o token | ricerca bloccata dal confine privacy |
| due fonti in conflitto | conflitto dichiarato e criterio di scelta |
| cancellazione | fetch e generazione interrotte senza eventi tardivi |

Misura precisione delle citazioni, copertura delle affermazioni, latenza al
primo token, tasso di fallback, errori per provider e violazioni del confine
privacy. Un miglioramento entra in produzione soltanto se supera una baseline
versionata sugli stessi casi.

## Riferimenti

- [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)
- [Google Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking?generate-content=true)
- [Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search?authuser=14)
- [Model Context Protocol in Claude](https://docs.anthropic.com/en/docs/mcp)

## Collegamenti

- [[Agenti tool use pianificazione e consenso]]
- [[Evaluation safety e red teaming per AI]]
- [[Knowledge engineering fonti retrieval e governance]]
- [[Serving LLM gateway routing capacita e affidabilita]]
