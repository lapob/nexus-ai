# Stato attuale

NEXUSNXS 0.3.9 distingue due profili: il client pubblico usa il servizio
NexusNXS Core via HTTPS, mentre la workstation dello sviluppatore può usare e
valutare runtime locali senza includerli nell'installer pubblico.

## Implementato

- shell React/TypeScript full-screen, minimale e priva di navigazione statica;
- visualizer neurale e planetario WebGL caricati separatamente, con qualità
  adattiva, pausa in background e profili distinti per stato;
- profili grafici manuali fino a Super Ultra e regolazione automatica basata
  su fluidità, potenza disponibile, area della finestra e densità dello schermo;
- shell mostrata appena IPC e configurazione minima sono pronti, senza attendere
  download dei modelli o prima indicizzazione completa della knowledge;
- isola contestuale dinamica con stato, task, log, trascrizione e risposta;
- cronologia con navigatore a capitoli accessibile: ogni richiesta dell'utente
  diventa un riferimento discreto, cliccabile e sincronizzato con lo scroll;
- avvio immediato nella superficie principale, senza tutorial obbligatori;
- modalità privacy, input testuale e impostazioni richiamabili solo quando servono;
- selezione, test e calibrazione del microfono locale;
- rilevamento vocale adattivo con soglie calibrate sul rumore, pause proporzionali
  alla frase e rimozione conservativa delle finestre trascritte duplicate;
- selettore rapido `Ctrl+M` con compatibilità hardware e assegnazione immediata
  del modello conversazionale;
- retrieval ibrido lessicale/semantico dei Markdown con provenienza delle
  sezioni, fallback deterministico, cache incrementale e reindicizzazione manuale;
- manutenzione della knowledge dalla UI con linguaggio non tecnico, più
  inventario automatico e documentato degli strumenti portatili disponibili;
- modalità Quick e Deep su runtime AI indipendente dal provider;
- routing automatico approfondito per richieste composte, ambigue, operative o
  ad alto rischio, mantenendo immediate le domande semplici;
- Ollama locale o LAN con ruoli separati main/fast/embedding nel solo profilo
  sviluppatore/server; il client pubblico usa il provider NexusNXS Service;
- dataset JSONL locale append-only alimentato esclusivamente da risposte approvate;
- voce locale Windows/Whisper, acquisizione monostep e risposta Kokoro/Windows
  breve, interrompibile e protetta da risultati obsoleti;
- capability di sistema validate, ticket monouso, consenso nativo e audit;
- ciclo operativo esplicito comprendere, pianificare, autorizzare, eseguire,
  verificare e riferire, con cancellazione, dry-run, checkpoint e rollback;
- memoria personale modificabile con provenienza, scadenza e sostituzione
  conservativa delle preferenze esplicitamente contraddette;
- telemetria locale minimizzata con percentili separati per preparazione,
  primo token, inferenza, verifica e durata totale, senza prompt o risposte;
- Console privata con telecomando applicativo allowlist-only, stato aperto in
  background, tile elastiche e motion adattivo a RAM, refresh rate e preferenze
  di accessibilità del dispositivo;
- riepiloghi operativi persistenti con file modificati, conteggio diff, codice
  evidenziato e dettaglio accessibile da mouse, tastiera e touch;
- confronto prima/dopo, timeline verificata, ricerca per attività o errore,
  confronto tra rigenerazioni e checkpoint transazionali multi-file;
- sandbox Electron, CSP, validazione IPC, fuse di produzione e blocco degli endpoint Internet;
- installer NSIS pubblico collegato al servizio NexusNXS HTTPS e privo di
  runtime e modelli Ollama; solo la qualità grafica viene adattata all'hardware;
- test unitari, smoke test Electron e controllo automatico delle sezioni.

## Limiti noti

- L'audit del runtime distribuito è disponibile con `npm run audit:runtime` ed
  è incluso in `npm run verify`.
- `npm run audit:tooling` controlla separatamente la toolchain di build. Al
  27 luglio 2026 segnala advisory transitive di `electron-builder`; non va
  applicato `npm audit fix --force`, perché propone un downgrade incompatibile.

- la cronologia conversazionale usa SQLite locale e non prevede sincronizzazione
  fra dispositivi;
- l'indicizzazione iniziale usa un worker dopo il primo paint e riapre una cache
  persistente; gli aggiornamenti restano espliciti per non sottrarre risorse alla chat;
- la knowledge non è esposta come workspace grafico in questa UI voice-first;
- il retrieval combina ranking lessicale, embedding e cache persistente, ma la
  qualità semantica resta dipendente dal provider di embedding disponibile;
- il controllo GUI generalizzato non è implementato;
- la release Windows non è firmata digitalmente;
- il runtime Ollama è riservato alla workstation sviluppatore/server; il client
  pubblico non cerca e non scarica modelli locali;
- il fine-tuning dei pesi e la produzione di adapter restano pipeline esterne; NEXUSNXS importa e usa il risultato tramite Ollama;

## Confini intenzionali

- nessuna azione di sistema viene eseguita senza conferma esplicita;
- i contenuti della vault sono dati, non istruzioni privilegiate;
- gli endpoint Internet vengono rifiutati; la LAN RFC1918 richiede opt-in;
- le note di lavoro con `rag: false` restano escluse dall'indice;
- NEXUSNXS non simula lo stato `READY` quando il runtime AI è offline.
- l'interfaccia ordinaria non espone RAM, GPU, nomi backend, benchmark o
  statistiche della memoria; la diagnostica tecnica resta confinata ai log;

## Qualità del codice

Consulta `CODE_MAP.md` per orientarti e cerca `#region` nell'IDE. Ogni nuovo
file sorgente deve includere `@module` e `@description`; i file lunghi devono
avere regioni numerate. `npm run check` applica automaticamente questa regola.
