---
title: Principi e modelli mentali dell'informatica
type: manual
area: computer-science
status: evergreen
level: advanced
visibility: public
created: 2026-07-30
updated: 2026-07-30
source_kind: curated
tags: [informatica, modelli-mentali, troubleshooting, sistemi, sicurezza]
aliases: [Modelli mentali informatici]
---

# Principi e modelli mentali dell'informatica

Le invarianti dell'informatica permettono di prevedere il comportamento di sistemi non ancora osservati. L'analisi professionale costruisce un modello, raccoglie evidenze e modifica una variabile alla volta.

## Le astrazioni perdono

Ogni livello nasconde quello inferiore, ma non lo elimina:

- un'applicazione dipende da runtime, syscall, filesystem, rete e hardware;
- un container condivide il kernel dell'host;
- una query SQL diventa un piano con I/O, lock e memoria;
- una chiamata HTTP diventa DNS, routing, TCP o QUIC, TLS e logica applicativa;
- una funzione “asincrona” consuma comunque thread, code, socket e timer.

Quando il livello alto non spiega il problema, scendere di uno strato. Non saltare direttamente al kernel: scegliere il livello più vicino capace di produrre evidenza.

## Stato, identità, tempo e confini

Quasi ogni bug difficile appartiene a una combinazione di quattro dimensioni:

1. **stato:** quale dato è persistito, in cache, replicato o soltanto in memoria;
2. **identità:** quale utente, token, processo o principal sta davvero operando;
3. **tempo:** in quale ordine avvengono eventi, retry, timeout e scadenze;
4. **confine:** dove cambiano formato, privilegio, protocollo o responsabilità.

Domande diagnostiche:

- chi ha creato questo valore e chi può modificarlo?
- è la fonte autorevole o una copia?
- quale clock determina scadenza e ordinamento?
- l'operazione è idempotente?
- cosa accade se il processo termina tra due scritture?
- quale input attraversa un confine di fiducia?

## Il costo non scompare

CPU, RAM, storage, rete e attenzione umana sono budget. Un'ottimizzazione sposta spesso il costo:

- cache: meno latenza, più memoria e invalidazione;
- compressione: meno rete, più CPU;
- replica: più disponibilità, più consistenza da gestire;
- parallelismo: meno tempo ideale, più coordinamento e contesa;
- logging: più osservabilità, più I/O, privacy e rumore.

Misurare p50, p95 e p99; distinguere throughput da latenza; osservare code e saturazione. Una media buona può nascondere code pessime.

## Errori distribuiti e fallimenti parziali

In rete non esiste un risultato unico “non funziona”. Una richiesta può essere:

- non inviata;
- inviata ma non ricevuta;
- ricevuta ed eseguita senza risposta;
- risposta ma non osservata dal chiamante;
- duplicata da un retry.

Per questo servono timeout espliciti, idempotency key, retry con backoff e jitter, limiti, circuit breaker e riconciliazione. Ritentare indiscriminatamente può amplificare un incidente.

## Sicurezza come proprietà del sistema

La sicurezza non è un tool finale. È la composizione di:

- asset e dati classificati;
- identità forti e privilegi minimi;
- input non fidati validati al confine;
- segreti fuori dal codice e ruotabili;
- logging utile ma privo di credenziali;
- aggiornamenti verificati e rollback;
- backup provati;
- rilevazione e risposta.

Una vulnerabilità nasce spesso da una discrepanza tra ciò che due componenti credono: parser differenti, canonicalizzazione diversa, autorizzazione verificata prima di una trasformazione, cache che ignora l'identità.

## Metodo generale di troubleshooting

```text
Sintomo -> ambito -> ipotesi -> misura -> confronto -> modifica -> verifica -> rollback
```

1. scrivere il sintomo osservabile e l'ora;
2. definire cosa funziona e cosa no;
3. riprodurre con il caso minimo;
4. acquisire stato prima di modificarlo;
5. formulare ipotesi falsificabili;
6. ordinare i test per costo e rischio;
7. cambiare una variabile;
8. verificare risultato e effetti collaterali;
9. documentare causa, correzione e prevenzione.

## Laboratorio integrato

Creare un servizio locale che legge un file, interroga un database e risponde via HTTP. Introdurre separatamente:

- permesso filesystem errato;
- porta occupata;
- DNS locale errato;
- timeout database;
- race condition su un contatore;
- input non validato;
- log contenente un falso segreto.

Per ogni guasto produrre timeline, evidenza, root cause, fix, test di regressione e rollback.

## Collegamenti

- [[01_Informatica/Computer Science/Indice - Computer Science|Computer Science]]
- [[01_Informatica/Networking/Indice - Networking|Networking]]
- [[01_Informatica/Linux/Indice - Linux|Linux]]
- [[01_Informatica/Windows/Indice - Windows|Windows]]
- [[02_Cybersecurity/Indice - Cybersecurity|Cybersecurity]]
- [[03_Sviluppo/Indice - Development|Development]]
- [[05_Risorse/Metodo professionale per comandi procedure e troubleshooting|Metodo professionale di troubleshooting]]
