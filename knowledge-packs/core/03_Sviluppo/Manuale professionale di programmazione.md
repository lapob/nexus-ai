---
title: Manuale professionale di programmazione
type: reference
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [programming, software-engineering, testing, secure-development]
aliases: [Manuale di programmazione, Software engineering manual]
---

# Manuale professionale di programmazione

## Sintesi

Programmare professionalmente significa trasformare un requisito in un sistema comprensibile, verificabile, osservabile e sicuro. La sintassi è solo una parte del lavoro.

## Modello mentale

Ogni programma è una trasformazione:

```text
input non fidato → parsing → validazione → modello di dominio
→ decisione → effetto controllato → output → log/metriche
```

Le parti più rischiose sono i confini: rete, filesystem, database, processi, serializzazione, identità e dipendenze esterne.

## Ciclo completo

1. definisci comportamento osservabile e casi limite;
2. identifica dati, attori, asset e trust boundary;
3. scegli la struttura più semplice che soddisfa il requisito;
4. scrivi test sui comportamenti critici;
5. implementa con errori espliciti e dipendenze isolate;
6. verifica staticamente, dinamicamente e manualmente;
7. aggiungi log, metriche e timeout;
8. documenta esecuzione, configurazione e rollback;
9. misura prima di ottimizzare;
10. riesamina sicurezza e operatività.

## Fondamenti da padroneggiare

### Dati e tipi

- rappresentazione di numeri, testo, date, byte e valori assenti;
- mutabilità, aliasing, copia e identità;
- conversioni esplicite e perdita di precisione;
- invariant: condizioni che devono restare vere.

### Controllo

- condizione, iterazione, funzione e ricorsione;
- separazione tra calcolo puro ed effetto;
- errori previsti contro bug;
- cancellazione, timeout e backpressure.

### Memoria e risorse

- stack, heap e lifetime;
- garbage collection, RAII o ownership;
- file, socket, lock e transazioni;
- cleanup deterministico anche in caso di errore.

### Concorrenza

- task, thread, event loop e processi;
- race condition, deadlock e starvation;
- condivisione tramite lock o comunicazione tramite messaggi;
- idempotenza e retry con limite.

## Scelta del linguaggio

| Esigenza | Scelta iniziale | Motivo |
|---|---|---|
| automazione, dati, security tooling | Python | ecosistema, leggibilità, velocità di sviluppo |
| frontend e servizi web | TypeScript | piattaforma web e controllo statico |
| CLI, rete, servizi cloud | Go | binari semplici, concorrenza, toolchain uniforme |
| backend enterprise/Windows | C#/.NET | runtime, tooling, ASP.NET Core |
| backend JVM/Android | Java o Kotlin | ecosistema JVM e interoperabilità |
| sistemi e memory safety | Rust | ownership e controllo senza GC |
| interoperabilità e sistemi legacy | C/C++ | controllo e compatibilità, con rischio maggiore |
| query e trasformazioni dati | SQL | modello relazionale e operazioni insiemistiche |
| orchestrazione locale | PowerShell/Bash | integrazione con sistema e processi |

La scelta dipende anche da team, manutenzione, runtime, librerie, deployment e profilo di rischio.

## Struttura minima di un progetto

```text
project/
├── README.md
├── src/
├── tests/
├── docs/
├── config.example
├── lockfile
└── script di verifica
```

Il README deve spiegare prerequisiti, avvio, test, configurazione, limiti e modello di sicurezza.

## API e confini

Una buona funzione:

- ha un contratto riconoscibile;
- riceve dipendenze esplicite;
- valida al confine;
- non nasconde effetti inattesi;
- restituisce un risultato o errore utile;
- è testabile senza infrastruttura globale.

Preferisci valori di dominio (`UserId`, `Email`, `Money`) a stringhe generiche quando l’errore sarebbe costoso.

## Gestione degli errori

Classifica:

| Classe | Esempio | Comportamento |
|---|---|---|
| input | formato invalido | rifiuta con messaggio sicuro |
| dominio | operazione non consentita | risultato esplicito |
| dipendenza | timeout database | retry limitato o fallback |
| programmazione | invariant violata | fail fast e osservabilità |
| sicurezza | autorizzazione negata | nega, registra senza segreti |

Non usare eccezioni o log come normale controllo di flusso. Non mostrare stack trace o dettagli interni all’utente.

## Testing

- unit test per logica e casi limite;
- integration test per database, filesystem, rete e provider;
- contract test per API;
- end-to-end per flussi essenziali;
- property-based test e fuzzing per parser;
- benchmark soltanto su percorsi misurati.

Un test deve fallire per una ragione comprensibile e non dipendere da tempo, rete o ordine quando non necessario.

## Debugging scientifico

1. riproduci;
2. riduci il caso;
3. osserva stato e timeline;
4. formula una sola ipotesi;
5. cambia una variabile;
6. conferma causa, non correlazione;
7. aggiungi test di regressione;
8. verifica effetti collaterali.

## Secure coding

- tratta input e dati esterni come non fidati;
- applica autorizzazione server-side a ogni oggetto e azione;
- usa query parametrizzate e output encoding contestuale;
- limita privilegi, dimensioni, durata e frequenza;
- usa primitive crittografiche e secret store standard;
- blocca versioni con lockfile e controlla provenienza;
- non registrare password, token, cookie o dati personali non necessari;
- progetta comportamento sicuro anche quando una dipendenza fallisce.

Approfondisci in [[Sicurezza del software]] e [[02_Cybersecurity/Application Security/Indice - Application Security|Application Security]].

## Code review

Controlla nell’ordine:

1. requisito e comportamento;
2. trust boundary e autorizzazione;
3. correttezza dei dati;
4. errori e cleanup;
5. test;
6. concorrenza;
7. dipendenze e configurazione;
8. leggibilità;
9. prestazioni misurate.

## Percorso di padronanza

1. CLI che legge input, valida e produce JSON.
2. API con autenticazione, database e test.
3. worker concorrente con cancellazione e retry.
4. servizio osservabile con log, metriche e tracing.
5. threat model, security test e deploy riproducibile.


## Fonti ufficiali

- Python Tutorial: https://docs.python.org/3/tutorial/
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- Go Documentation: https://go.dev/doc/
- The Rust Programming Language: https://doc.rust-lang.org/book/
- .NET Fundamentals: https://learn.microsoft.com/dotnet/fundamentals/
- Java Documentation: https://docs.oracle.com/en/java/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
