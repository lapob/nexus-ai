---
title: Serving LLM: gateway, routing, capacità e affidabilità
type: professional-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-08-15
updated: 2026-08-15
source_kind: curated-synthesis
tags: [ai, inference, serving, gateway, reliability, capacity]
aliases: [Serving LLM, Inference gateway]
---

# Serving LLM: gateway, routing, capacità e affidabilità

## Obiettivo

Un prodotto AI pubblico non distribuisce necessariamente il modello ai client. Il client raccoglie l'input, mantiene l'esperienza utente e apre una richiesta autenticata; il servizio centrale applica policy, sceglie il modello, esegue l'inferenza e restituisce eventi progressivi.

La separazione fondamentale è:

`client → edge/API gateway → autenticazione e limiti → router AI → coda → runtime modello → verifica → stream`

## Responsabilità del client

- conservare localmente bozza, preferenze e cronologia quando previsto;
- inviare un identificativo richiesta idempotente;
- mostrare stati `connessione`, `in coda`, `generazione`, `completata` e `offline`;
- riprendere una richiesta senza duplicarla dopo un cambio rete;
- non conoscere percorsi, porte locali, nomi interni o credenziali del runtime;
- non cercare né scaricare modelli quando il prodotto usa inferenza remota.

## Responsabilità del gateway

Il gateway termina TLS, valida dimensione e tipo del payload, crea una sessione a privilegi minimi, applica rate limit e quote, assegna un request ID e inoltra soltanto campi ammessi. Le funzioni amministrative devono usare un ingresso distinto da quello pubblico.

Non affidarsi a header di origine forniti dal client. Se esiste un reverse proxy fidato, definire esplicitamente quali hop possono valorizzare gli header di inoltro.

## Routing dei modelli

Il router decide usando segnali osservabili:

| Segnale | Decisione possibile |
|---|---|
| saluto o richiesta breve | modello rapido o risposta deterministica |
| codice, più vincoli, allegati | modello principale |
| immagine | modello con capacità vision |
| rischio elevato o bassa confidenza | revisione con modello più robusto |
| modello richiesto non disponibile | stato non disponibile, oppure fallback dichiarato |

La scelta manuale va validata contro un catalogo server-side. `automatic` è una policy, non il nome di un modello.

## Streaming corretto

Usare un protocollo con eventi tipizzati, per esempio:

```text
phase     stato sintetico e non ragionamento privato
token     testo incrementale
replace   sostituzione verificata della bozza
complete  risultato terminale e metadati minimi
error     errore pubblico stabile
```

Ogni richiesta deve produrre un solo evento terminale. Il client non deve salvare come completa una risposta troncata e deve distinguere cancellazione, timeout, sovraccarico e indisponibilità.

## Capacità e backpressure

Definire concorrenza massima per runtime, lunghezza della coda e timeout di attesa. Quando la coda è piena rispondere con un errore temporaneo e un'indicazione di retry; non accettare lavoro illimitato in memoria.

Metriche minime:

- disponibilità e tasso di errore;
- time to first token, durata totale e token al secondo;
- richieste attive, profondità coda e tempo in coda;
- saturazione CPU, GPU, VRAM e RAM sul server;
- cancellazioni, retry, fallback e risposte troncate;
- successo per classe di richiesta e versione modello.

## Continuità e idempotenza

Il client genera un `clientMessageId` stabile. Il server conserva temporaneamente l'esito associato: se la rete cade dopo l'elaborazione, il retry restituisce lo stesso risultato senza eseguire due volte.

Le sessioni devono scadere, ruotare e poter essere revocate. I token si archiviano come hash sul server e in storage protetto sul dispositivo.

## Sicurezza e privacy

- TLS obbligatorio sull'ingresso pubblico;
- token con scope minimo e scadenza breve;
- payload e allegati limitati e trattati come non fidati;
- prompt, risposte e file esclusi dai log per default;
- knowledge privata e strumenti operativi esclusi dalle sessioni pubbliche;
- console, telemetria e azioni di alimentazione su un canale amministrativo separato;
- audit append-only per autenticazioni, rate limit e operazioni sensibili.

## Strategia di rilascio

1. testare provider e gateway in memoria;
2. provare la catena end-to-end sul listener locale;
3. provare l'origine HTTPS privata;
4. eseguire canary con pochi client;
5. misurare coda, TTFT, errori e costo per richiesta;
6. pubblicare soltanto dopo rollback e monitoraggio verificati.

## Failure matrix

| Guasto | Comportamento corretto |
|---|---|
| server spento | client offline, bozza conservata |
| modello assente | modello non disponibile, nessun download client |
| coda piena | retry controllato, nessun loop aggressivo |
| stream interrotto | risposta marcata incompleta e riprendibile |
| token scaduto | una rotazione o nuova sessione, poi errore chiaro |
| modello lento | fase visibile, timeout differenziato, cancellazione funzionante |

## Collegamenti

- [[MLOps versionamento deployment e monitoraggio]]
- [[Evaluation safety e red teaming per AI]]
- [[RAG embeddings memoria e knowledge graph]]
- [[Sistemi distribuiti resilienza e consistenza]]
- [[Reliability engineering SLO error budget e postmortem]]
