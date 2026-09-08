# Verifica del progetto — 8 settembre 2026

## Modifiche e prove

- Scena Core pubblico: canvas trasparente esteso alla viewport, pulsante accessibile conservato nel layout. Le stesse particelle partono dalla pagina e convergono nei nastri in 3,8 secondi; eliminato il cerchio separato che svaniva. Sfondo persistente e centro attenuato per la lettura. Opzione limitata alla web app: geometria e animazioni desktop predefinite conservate.
- Anteprima web a 390x844 e 1280x844: nessun errore JS o overflow; movimento ridotto assembla subito. Puntatore senza cambio dimensione del Core; campione mobile simulato p95 16,8 ms, zero intervalli oltre 50 ms, costo di disegno medio smussato circa 1,1 ms. Layout conversazione controllato con testo di fixture, senza attribuirlo all'AI. Evidenze locali `core-scene-report.json`, `core-interaction-report.json` e screenshot `core-*.png`.

- Android Preview 6.4.10 compilata e installata sul telefono: il ricentramento conserva lo stesso albero Markdown e la stessa larghezza; lo scroll automatico termina con lo streaming. Risposta reale acquisita in `qa-artifacts/current-finish.png`. La misura dell'intero ciclo comprende ancora 22 frame janky su 147 (14,97%, p95 15 ms, p99 400 ms): non certifica fluidità assoluta né isola il solo ricentramento.
- Web: particelle ambientali sincronizzate al display sui dispositivi adeguati; limite ridotto conservato per risparmio dati/memoria. Dopo l'assemblaggio non vengono ridisegnate particelle invisibili né letto il layout del Core. Campione browser 300 frame: mediana 16,7 ms, p95 16,8 ms, nessun frame oltre 50 ms, nessun errore JS (`current-web-metrics.log`).
- AI: controllo esplicito del formato numerico finale; conservazione di obiettivo iniziale e correzioni nelle conversazioni lunghe; correzione locale dei ricordi con `Correggi il ricordo #12: nuovo contenuto`. Ricordi cancellati non riattivati; preferenze sullo stesso argomento consolidate. Impostazioni mostrano tutti i ricordi restituiti dal backend (massimo 100), con identificativi.
- Docker: l'avvio automatico utente ora usa `scripts/start-docker-desktop.ps1`, verifica firma e percorso dell'installazione, ripristina la registrazione utente e avvia il launcher. Valore precedente conservato localmente in `qa-artifacts/docker-startup-before.txt`. Docker e SearXNG avviati con successo. Il prossimo login Windows non è stato provato; nessun riavvio del PC eseguito.
- 838 test completi, 132 regressioni sicurezza, build/typecheck, AI/voce/Electron/shutdown/250 cicli superati. Backup cifrato sintetico: 4 file ripristinati. Evidenze `current-tests-memory.log`, `current-security-final.log`, `current-check-memory.log`, `current-experience-final.log`, `current-backup.log`.
- Sito commit `040e152`, Worker produzione `f7f69808-7ff4-421d-a2c4-66fc2e08efa0`: 34 test unitari, 23 browser, 14 percorsi pubblici e intestazioni verificati. Nessun Core desktop modificato.

## Sicurezza e attività non concluse

### Secondo controllo dell'8 settembre

- Corretto il routing: modalità approfondita e allegati conservano ora valutazione del rischio, incertezza e necessità di revisione; prima il ritorno anticipato le azzerava.
- Rafforzato il gate Android Stable: metriche mancanti, stringhe numeriche, valori negativi e profili duplicati non possono certificare una matrice valida.
- Verifiche superate: 840 test, 132 regressioni sicurezza, build/typecheck e `verify:experience` completo. Soak: 250 cicli, zero richieste orfane, crescita heap 0,07 MB. Gateway sotto carico: 7 richieste servite, 13 respinte per backpressure su 20, coda massima 5, p95 320 ms. Log locali `security-pass-*.log`.
- Esaminato separatamente il candidato ufficiale Ollama 0.33.3: checksum degli archivi verificati e firma dell'eseguibile valida. Anche questo eseguibile produce 45 finding High/Critical (42 identificativi distinti), come 0.32.15. Lo scanner segnala assenza di simboli delle funzioni e confronto a granularità modulo: i finding richiedono valutazione, non costituiscono prova di 45 vulnerabilità sfruttabili. Il candidato non è stato promosso e il gate di distribuzione resta bloccante. Evidenze locali `ollama-review.json` e `ollama-candidate/security.log`.
- Docker e SearXNG riavviati correttamente tramite `search:start`; voce di avvio e registrazione utente coerenti. Avvio al login ancora da verificare senza riavviare il PC.
- Telefono non più raggiungibile al precedente indirizzo ADB: prove Android aggiuntive in attesa dell'indirizzo attuale.

- Audit npm runtime: zero vulnerabilità segnalate. Questo risultato non comprende tutte le dipendenze native.
- Il gate di distribuzione Ollama 0.32.15 blocca il runtime per 45 finding High/Critical a granularità modulo. Uso locale limitato a loopback; non dichiarare risolti i finding o distribuibile il runtime. Evidenza `current-ollama-distribution.log`.
- Stable: 4 requisiti conformi, 11 bloccati; firme, origine aggiornamenti, backup esterno, continuità elettrica/rete, rotazione chiavi, upgrade su PC pulito, esercitazione incidenti e pentest indipendente restano mancanti.
- Sincronizzazione pubblica facoltativa non implementata: servono identità isolata dal proprietario, revoca, cancellazione e gestione conflitti. Le API proprietarie non devono diventare pubbliche.
- Ulteriori prove richieste: fluidità Android a fine streaming isolata dal resto del ciclo, cambio rete/background, voce/Bluetooth, test estesi di incertezza e allegati discordanti. Le funzionalità preesistenti di calcolo, ricerca, strumenti con consenso e routing non equivalgono al completamento di tutta la roadmap.
- APK installata come Preview locale; nessun nuovo installer Windows o bundle Play firmato distribuito in questo passaggio.
