# Stabilizzazione: evidenze e lavoro residuo

Aggiornamento: 1 ottobre 2026. Non e una dichiarazione di prontezza commerciale.
Il checkpoint operativo, commit e hash sono in `../CONTINUITA.md` dalla radice del repository.

## Checkup del 1 ottobre

### Completamento installer e Preview 0.3.18

- Installer pubblico Windows 0.3.18 costruito con Electron 43.7.7, senza
  runtime Ollama o modelli locali inclusi. Versione precedente installata
  0.3.14 conservata in archivio di ripristino locale, senza dati del profilo.
- Installazione reale completata; ASAR installato 0.3.18, preload/CSP/IPC e
  renderer PASS. Il controllo automatico estratto dalla build installata
  rispetta l'opt-out: task Windows disabilitati prima e dopo la chiamata.
  Questo chiude il limite del precedente installer descritto sotto.
- Verifica installer resa fail-closed per artefatti assenti/vuoti, ASAR di
  versione diversa o codice di avvio obsoleto. Sedici test mirati PASS.
  Suite finale 955 PASS, 2 SKIP, zero FAIL; check sorgenti e renderer PASS.
- Android pubblico 6.5.20: build Preview ottimizzata, lint e firma APK
  verificati. Nessuna nuova prova fisica: ADB non rileva dispositivi.
- Preview con aggiornamento manuale: Windows senza firma editore, Android
  con certificato Debug. Non e una release Stable o un bundle Play.

- Avvio Windows disattivato: task Server, Connectivity e Presence disabilitati,
  con XML di ripristino conservati fuori Git. Preferenza locale persistente:
  la registrazione automatica rispetta la rinuncia; avvio e riavvio manuali
  del servizio non installano o riabilitano il task. Otto test mirati passati.
- Trascrizione remota separata dal microfono desktop. Disconnessione HTTP e
  arresto annullano la propria trascrizione; risultati tardivi scartati.
  Quattro regressioni HTTP coprono sintesi/trascrizione e disconnessione/stop;
  il test del processo STT controlla abort, file temporaneo e richiesta successiva.
- Electron aggiornato a 43.7.7 e dipendenze vulnerabili corrette senza cambio
  di major. Audit npm completo di app e sito: zero vulnerabilita note.
  Il risultato non annulla il blocco separato del runtime Ollama.
- Controllo sorgenti PASS; suite 946 PASS, 2 SKIP, zero FAIL. Un primo worker
  della suite era fallito senza diagnostica: test mirato e ripetizione completa
  passati. Non e stata attribuita una causa non dimostrata.
- Web: offline PASS, cancellazione cronologia PASS (abort della richiesta,
  cancellazione server e scarto dei frammenti tardivi), 21 layout e 40 stati
  PASS. Le acquisizioni ora attendono la formazione del Core. Audit automatico
  di sei superfici passato; restano prove fisiche e accessibilita manuale.
- Sito c76e26b: query informativa di stato restituisce JSON HTTP 200 anche
  quando AI offline; readiness reale conserva il proprio errore. Gate completo
  passato: 37 test, 26 prove browser, firma dipendenze, build e dry-run.
- ADB non rileva dispositivi nel check corrente: nessun nuovo collaudo Android
  fisico dichiarato. iOS richiede ancora compilazione e prova con Xcode.
- Gate esperienza finale PASS su runtime dedicato, senza servizio attivo:
  valutazione dei due modelli esistenti, sintesi, smoke Electron, chiusura
  e soak di 250 cicli con zero richieste orfane. Nessun modello addestrato
  o promosso. Publication safety PASS su 908 file; igiene PASS su 840 file
  e 281 moduli univoci. La copertura automatica non prova l'assenza di bug.
- Revisione fc8e6b6 pubblicata su GitHub e caricata dal servizio. Health e
  readiness pubbliche HTTP 200; risposta breve 1375 ms, STT italiano 2623 ms,
  TTS WAV 1574 ms. Sono singole richieste sintetiche, non un collaudo umano.
  Sito pubblicato e verificato su 14 rotte, versione Cloudflare
  `dba3f714-2ea1-4c6d-88d5-39cbe8c12014`.
- Nessun nuovo installer Windows o APK distribuito. Il collegamento desktop
  punta al binario installato precedente: la protezione di autostart dei nuovi
  sorgenti deve ancora essere inclusa nell'installer. I tre task di questo PC
  sono disabilitati; ricontrollarli se viene riaperta una build precedente.

Log locali: `../qa-artifacts/checkup-oct01-*`. Revisione attiva e pubblicazione
sono registrate nel checkpoint; non confondere questi controlli con una Stable.

## Recupero e candidati del 30 settembre

- Ripristinata la cronologia Git dalla revisione salvata `20f4c17`, dopo la
  cancellazione del checkout principale. I sorgenti locali Android e iOS
  sono stati conservati. Dipendenze npm ed Electron ricostruiti dalla cache.
- Android pubblico 6.5.20: impostazioni a schermo intero, categorie raggruppate,
  larghezza limitata sui tablet e gesture del drawer disattivata nelle
  impostazioni. Build/lint e 48 contratti passati; la prima variante e stata
  ispezionata sul Samsung. Anche la matrice finale passa su cinque profili:
  frame lenti 3.68%-8.41%, con ripristino del display originale. Non copre
  ogni gesto o tutte le combinazioni di dispositivi.
- `ios` contiene una base SwiftUI/WKWebView localizzata, senza bridge
  privilegiato. Compilazione Xcode e prove iPhone/iPad non eseguite.
- Voce recuperata: worker versionato in `src/voice/neural-worker.py`, runtime
  Python verificato e manifest con dipendenze e hash dei modelli. Il provisioning
  separa sorgenti e asset ed e verificabile senza reinstallazione. Sei frasi
  italiane producono WAV validi: 5058 ms a freddo, mediana 900 ms a caldo.
  Questa misura non certifica naturalezza, riconoscimento o cancellazione eco.
- Riprodotta l'interruzione fra richieste TTS concorrenti. Il candidato usa
  motori remoti distinti dal desktop e una coda limitata, con proprietario,
  cancellazione HTTP e arresto. Due richieste reali completate; test mirati e
  revisione indipendente passati. Il servizio e stato aggiornato e una
  sintesi pubblica reale ha restituito un WAV valido in 2733 ms.
- Suite finale: 943 passati, zero falliti, 2 saltati; controllo sorgenti e build
  renderer passati. Otto lingue producono WAV nel probe sintetico, senza
  certificazione umana della pronuncia.
  Doctor 10/10, smoke, shutdown, soak 250 cicli senza orfani e web offline
  passati. Il servizio ha caricato la revisione 286cc4e durante la manutenzione.
- Grafica web: 21 layout Core, 40 stati di interfaccia, pianeta ad alta densita
  nei quattro stati vocali, dock su 11 viewport e audit automatico di sei
  superfici passati. Corretta la verifica della larghezza mobile per rispettare
  il padding effettivo; nessun allargamento della barra. Queste prove non
  sostituiscono il controllo fisico Android o una certificazione di accessibilita.
- Runtime Ollama 0.32.15 ripristinato dagli archivi ufficiali verificati;
  controllate le firme di 83 binari. Riparato il database locale dello scanner.
  Health e readiness tornati disponibili; una risposta pubblica breve completa
  in 799 ms conferma il percorso chat, senza costituire un benchmark generale.
- Web offline: bozza, allegati, tre profili, riconnessione senza invio e reload
  anonimo passati. Impostazioni Android finali ispezionate sul Samsung in
  verticale, a schermo intero e con gruppi leggibili; matrice finale passata.
- Model Factory: nessun esempio autorizzato esportabile e nessuna preferenza
  nel controllo corrente; training non pronto. Sono presenti 40 casi di
  valutazione in 9 categorie, ancora da ampliare e revisionare.
- Gate esperienza superato dopo manutenzione del solo servizio: 8B 94%,
  14B 100% su 18 casi ciascuno, mediane 3810/5716 ms, voce, smoke,
  shutdown e soak 250 cicli senza orfani. Il runtime di valutazione era
  dedicato; servizio riavviato, health e readiness pubbliche verificate.
  Non e un confronto universale con prodotti commerciali. Collaudo vocale
  umano e build iOS restano aperti; nessuna nuova release stabile.
- Provisioning Ollama: accettate esclusivamente tre DLL redistributable
  Microsoft con firma valida e publisher Microsoft, oltre ai binari Ollama.
  Matrice di dieci casi positivi/negativi e verifica runtime esistente passate.
  Restano 45 rilievi High/Critical a granularita modulo: il gate permette solo
  sviluppo loopback, non distribuzione. Nessuna eccezione di release aggiunta.
- Anche il candidato ufficiale Ollama 0.35.0 presenta 45 rilievi nel gate:
  non e stato sostituito al runtime attivo e non risolve il blocco distribuzione.
- Correzione revoca: le connessioni eventi/telemetria gia aperte vengono
  chiuse prima dei messaggi di cancellazione, con controllo dell'identita
  attuale su ogni invio e dopo elaborazioni asincrone. Due regressioni
  riprodotte prima del fix e risolte; rotazione token e altro dispositivo
  restano operativi. Revisione indipendente senza bypass concreto rilevato.
  L'audit generale Codex Security resta parziale, anche per un limite di
  utilizzo del revisore delle operazioni: non e una certificazione globale.
- STT locale ricostruito: manifest con hash e script ripetibile per
  whisper.cpp 1.9.2 CPU e modello base multilingue. Il controllo API distingue
  disponibilita del microfono SAPI dalla trascrizione di file audio.
  Prova sintetica TTS→STT: frase italiana corretta, lingua `it`, 857 ms.
  Non misura WER umano, rumore o eco. Il pacchetto include il modello base
  necessario ed esclude archivio di download e file parziali.
- Verifica pubblica dopo l'aggiornamento 286cc4e: health/readiness HTTP 200,
  trascrizione italiana HTTP 200 in 1019 ms, sintesi WAV HTTP 200 in 2412 ms,
  risposta chat semplice completata in 1027 ms. Misure su singole richieste,
  senza equivalenza a un benchmark di qualita o disponibilita continuativa.

Per ricostruire o verificare STT: `npm run voice:provision:whisper` e
`npm run voice:check:whisper`. Download circa 156 MB, inferenza solo locale;
binari e modelli restano esclusi da Git. Il controllo confronta ogni binario
installato con l'archivio ufficiale verificato, senza sovrascrivere file diversi.

Le evidenze del 28 settembre sotto restano riferite a quella revisione e
all'ambiente precedente; non certificano il runtime ricostruito.

| Area | Verificato | Residuo |
| --- | --- | --- |
| Componenti condivisi | Stati generati, Core e movimento Android condivisi, asset di marchio verificati; colori principali Android e fondo desktop/web collegati a `config/nexus-design-tokens.json` con verifica delle copie generate | Varianti di superficie, icone e spaziature conservano ancora definizioni locali. La migrazione non e totale |
| Pulizia | Politica dry-run, due versioni per client/formato, alias e file sconosciuti conservati; igiene di 830 file e 276 moduli senza duplicati accidentali rilevati | Il controllo delle copie non dimostra che ogni componente o dipendenza sia utilizzato. Nessuna rimozione speculativa di asset, dati o modelli |
| Repository | Sorgenti, strumenti, prove e output distinti; mappa in MAINTENANCE.md | Le versioni dei client restano indipendenti nei manifest nativi. Non confondere una versione unica con una distribuzione coordinata |
| Continuita | Control salva sezione, cartella e offset in dp; riapertura reale dopo arresto processo: stesso contenuto, scarto 1px. Le conferme sensibili non sono salvate | Bozze e conversazioni hanno percorsi gia esistenti, ma manca una matrice completa di tutti i client dopo rotazione/rete/process death |
| Grafica | Corrette collisioni avviso voce/dock a 360x420 e 768x1024; 11 viewport web PASS. Control: contrasto sotto status bar, righe verticali per font grande, cinque profili fisici PASS | Matrice completa di tutti gli stati desktop/pubblico Android e tutte le lingue da completare |
| Voce/allegati | 52 test gateway, incluso upload HTTP interrotto a meta, retry integro e deduplicato; sessione vocale e sintesi automatica PASS | Eco e interruzione con voce umana richiesti al proprietario. Il test HTTP usa un file sintetico reale su disco; non simula ogni browser o la perdita completa della pagina |
| Operativita | verify:experience PASS su endpoint CPU dedicato: 8B 94%, 14B 100% nel set breve; smoke, shutdown e soak 250 PASS | Non e prova di disponibilita continua o equivalenza con modelli commerciali. Latenza CPU distinta dalla produzione GPU |
| Distribuzione | Build/lint Control e verifiche automatiche di integrita/rollout PASS; rollback APK conservato | Certificati Windows/Android, chiavi manifest e feed aggiornamenti non configurati. Installazione e rollback firmati su macchina pulita ancora necessari |

## Regole di chiusura

### Control 1.19.8: navigazione e blur

- Cambio di sezione e cartella torna all'inizio; ripresa dell'app conserva
  sezione e posizione. Interrotto lo scroller nativo prima del reset: la
  prima soluzione `smoothScrollBy(0, 0)` ripristinava invece l'offset vecchio.
  Ritorno verificato nelle quattro sezioni con XML prima/dopo.
- Rimossi 26dp di spazi sommati sopra il primo pannello. Blur GPU su Android
  12+, campionamento 4x ridotto delle sole due fasce, maschere sfumate; gli
  altri sistemi mantengono la sfumatura senza blur software per frame.
- Il primo blur a viewport intero e stato scartato dopo 29.73% di frame
  lenti su un campione breve. La versione limitata alle barre ha registrato
  0.39% su 1024 frame durante 16 swipe, p95 frame 9ms e GPU 7ms.
- APK privato `3a8c67c54030e48077d75cdf5cb982173dc13d55c0a2b52750c6b7229df9b40a`
  installato: build/lint PASS, matrice finale 5 profili PASS (1.19–2.79%
  frame lenti), dimensioni originali del Samsung ripristinate. Non equivale
  a test fisico su cinque differenti dispositivi o versioni Android.
- Backup/ripristino cifrato con dati sintetici: PASS, quattro file.
  Certificati, feed e controlli operativi esterni per Stable restano aperti.
- Gate finale `control-blur-bands-experience.exit=0`: AI, voce, smoke,
  shutdown e soak250 PASS, zero orfani, heap +0.08 MB. Suite 929 PASS/2 SKIP.

### Control 1.19.7 e confezionamento del 28 settembre

- Titolo compatto sopra le schede, entrambi fissi; contenuti scorrevoli dietro
  una sfumatura nativa. Non e un blur del contenuto sottostante. Misure della
  barra e safe area determinano il padding, senza altezza fissa del titolo.
- APK privato installato sul Samsung: cinque profili online, inclusi font 2x
  e rotazione reale, verificati in `control-header-rotation-matrix`; frame
  lenti 0.30–0.37%. Schede ferme durante swipe nelle quattro sezioni.
- Il primo candidato era privo dell'endpoint locale e la matrice ha fallito
  correttamente. Ripristinata la configurazione ignorata da Git; il comando
  di build ora rifiuta Control senza endpoint privato. APK corretto: SHA256
  `91ec78171380385db556b24fe0d1182b1e2a34b5f0d3c98e30028ec881f7a29c`.
- Check e 929 test PASS/2 SKIP; `control-header-experience.exit=0`: AI,
  voce, smoke, shutdown e soak250 PASS, zero orfani, heap +0.08 MB.
- SBOM riproducibile dal lockfile con provenienza SHA256: 392 componenti,
  digest e versione verificati. Il download web puo puntare all'ultima
  Preview pubblicata mentre HEAD e un candidato: test verifica coerenza
  tag/installer. Nuova Preview pubblica ancora da confezionare e pubblicare.

### Correzione chiusura Windows del 28 settembre

- La traccia nativa, risolta con i simboli ufficiali Electron 43.2.0,
  identifica l'attesa in `GpuChannelProxy::DestroyCommandBuffer` durante
  `BrowserMainLoop::ShutdownThreadsAndCleanUp`, dopo il completamento dei servizi.
  Fermare il pet di prova liberava il processo della UI.
- L'avvio Windows dei processi fratelli ora passa da ShellExecute, evitando
  l'eredità degli handle Chromium. Il solo detached e il solo cambio del
  processo padre non erano sufficienti. Percorso POSIX e accelerazione grafica
  restano invariati; nessuna terminazione forzata introdotta nel prodotto.
- Sei chiusure native e quattro chiusure normali consecutive PASS mantenendo
  il pet attivo. Test reale di argomenti con spazi, parentesi, virgolette,
  backslash e metacaratteri, directory e ambiente PASS. Suite 929 PASS/2 SKIP,
  check e doctor PASS, audit dipendenze applicative: zero vulnerabilità.
- Candidato desktop 0.3.17. Gate completo finale PASS, con log persistente
  `shutdown-isolation-experience-final.log` e file `.exit=0`: AI 8B 94%,
  14B 100% sul set breve CPU isolato; voce, smoke, shutdown e soak250 PASS,
  zero richieste orfane, heap -0.51 MB. La prima esecuzione interrotta
  non è una verifica superata. Nessuna nuova release pubblicata.

### Consenso e verifica desktop del 28 settembre

- I voti desktop e le preferenze fra risposte registrano soltanto requestId,
  valutazione e variante nei log locali, senza testo, invio remoto o training.
  Il contributo e separato nel menu; il main process chiede consenso esplicito
  indicando destinazione e uso. Annulla e la scelta predefinita. Il provider
  pubblico rifiuta contributi senza consenso prima di accedere alla rete.
- Preparazione e validazione SFT/DPO richiedono consenso esplicito e stato
  approved. Gli esempi storici senza questi metadati non sono autorizzati per
  il training; non sono stati cancellati o retroattivamente approvati.
- `verify-response-feedback.js` esercita il componente React reale: voti,
  errori/retry, confronto e tre viewport PASS. La vecchia cattura response
  usa un fixture HTML, quindi non dimostra il comportamento dei controlli;
  la sua cattura al 150% ha inoltre fallito e resta registrata in consent-visual.log.
- Gate `consent-experience.log`: AI/voce/smoke PASS, shutdown FAIL a 15s,
  soak non eseguito. Diagnostica aggiunta: tutte le finestre risultano chiuse
  e pulizia servizi completata, ma il processo talvolta non termina. Due
  ipotesi provate (rilascio debugger e quit differito) non hanno risolto e
  sono state rimosse. Nessun timeout aumentato o terminazione forzata usata
  per far passare il gate. Distribuzione bloccata.
- Le due schede private scadute sono state ricontrollate: eseguibili assenti
  nelle posizioni inventariate. Disponibilita aggiornata, vecchi hash marcati
  storici e backup conservati; nessun inventario privato pubblicato.

### Control: navigazione persistente del 28 settembre

- Versione privata 1.19.6/code40: Panoramica, Sistema, App e Servizi sono
  fuori dallo scroller verticale, in un contenitore misurato da Android.
  Gli insets superiori appartengono alla barra quando visibile; connessione
  e conferme usano invece tutto lo spazio. Anche la preparazione dei comandi
  nasconde subito la barra. Il dock inferiore conserva il comportamento esistente.
- Samsung: selezione delle quattro sezioni e confronto XML prima/dopo swipe
  PASS (`qa-artifacts/control-pinned-scroll.json`). Matrice online di cinque
  formati, incluso font 200%, PASS; impostazioni display ripristinate.
- Build/lint/firma Preview e 60 controlli Android PASS. Questa installazione
  privata non costituisce una pubblicazione dei client pubblici o la chiusura
  dei punti aperti elencati sotto. Gate globale PASS (AI, voce, smoke,
  shutdown, soak250 con zero richieste orfane), registrato separatamente in
  `qa-artifacts/control-pinned-experience.log`. Il precedente timeout
  intermittente di shutdown resta da diagnosticare; un passaggio non ne
  dimostra la risoluzione. APK finale verificato nella matrice
  `qa-artifacts/control-pinned-final-matrix`, SHA256
  `AB39995105E15A3B5E84D048F9B274357033FF8EB5990295F11A92DCA4536EEF`.

### Cancellazione cronologia web e verifiche del 28 settembre

- Riprodotto nel browser il mancato annullamento della risposta dopo la
  cancellazione. Corretto il reset: stop trasporto/server e voce, invalidazione
  della richiesta e scarto di frame o immagini tardive. Una nuova domanda usa
  una cronologia vuota; il normale pulsante Interrompi conserva invece il parziale.
- `qa:web:history` e `qa:web:offline` PASS, 920 test PASS/2 skip,
  typecheck PASS. Il nuovo test usa un browser isolato e trasporti sintetici.
- `check` bloccato da due note knowledge con revisione scaduta il 23 settembre
  (7-Zip e capa); non aggiornare le date senza revisione delle fonti.
- `history-reset-experience.log`: AI, voce e smoke PASS, timeout shutdown15s,
  exit1, soak non eseguito. Retry mirato del 28 settembre PASS; intermittenza
  ancora aperta, nessuna pubblicazione di questo blocco.
- Model Factory: dataset esistente verificato, 2 esempi, zero preferenze,
  validation/test vuoti. SFT/DPO bloccati. Nessun training, download o promozione.
  Eval breve CPU del 25 settembre: 8B94%, 14B100%, mediane3718/5672ms;
  non dimostra superiorita o accuratezza generale. Consenso desktop ancora da separare.

### Verifica del 23 settembre

- Gate precedente Control 1.19.5 terminato: AI 8B 94%, 14B 100% nel set breve,
  voce, smoke, shutdown e soak 250 superati. Completata anche la matrice fisica
  Online su Samsung: cinque profili PASS, screenshot compatto/font grande e
  landscape ispezionati. Cartelle App/Giochi e ripristino dopo arresto processo
  verificati; display e dimensione font ripristinati. Nessun comando PC eseguito.
- Suite completa: 893 test superati; check sorgenti superato. Ripristino di
  quattro file sintetici superato; audit npm produzione zero segnalazioni.
- Web: corrette risposte readiness obsolete dopo perdita rete, sospensione o
  uscita pagina. L'aggiunta di allegati offline non riabilita Invio;
  Interrompi rimane utilizzabile durante una risposta anche senza rete.
- `npm run qa:web:offline` verifica un browser isolato, senza inferenza: bozza
  e allegato sintetico conservati tra tre dimensioni/orientamenti, riconnessione
  senza invio automatico. Il reload cancella la sessione anonima come dichiarato
  nell'interfaccia; non e una promessa di persistenza delle chat pubbliche.
- Layout web: 11 viewport superati, screenshot compatto ispezionato.
- Il controllo Stable precedente segnalava 14 requisiti non soddisfatti: firme, origine
  aggiornamenti, SLO, evidenze Android correnti, backup esterno, continuita
  elettrica, failover rete, rotazione chiavi, upgrade su macchina pulita,
  esercitazione incidente e penetration test esterno. Sono prerequisiti di
  rilascio, non 14 bug riprodotti. Non abbassare i requisiti per pubblicare.
- Il preflight segnala ancora finding High/Critical nei moduli del runtime
  Ollama, consentito dalla policy soltanto nello sviluppo loopback. L'audit npm
  non copre questo runtime. Eseguito anche il gate di distribuzione del runtime:
  rifiuta correttamente Ollama 0.32.15 con 45 finding High/Critical. Non aggirare
  il blocco e non includere questo runtime in una release commerciale.
  Anche il candidato ufficiale Ollama 0.34.3, verificato tramite SHA256, e stato
  rifiutato per 45 finding High/Critical: nessuna promozione. Rimosso soltanto
  l'archivio scaricato dopo la verifica (1.46 GB); eseguibile e prove conservati.
- Codex Security: scan `6f00900a-10d0-4f91-912e-74c2103f3cd2` avviata su
  `1a3d8e6`. Due finding Medium salvati nel draft: controllo dei file sensibili
  nelle anteprime/operazioni e binding dell'updater alla distinta firmata.
  Copertura ancora parziale: 42 file tracciati completamente esaminati, non l'intero
  repository. Le correzioni sono sviluppate nel worktree separato
  `.AI-fixes-sep23`; non costituiscono una pubblicazione o uno scan concluso.
- Registro sicurezza: riprodotto il falso errore d'integrita dopo 10000 eventi,
  corretto il ricalcolo durante rotazione legittima. Quattro test PASS,
  compresi riapertura e rifiuto di una catena manomessa.
- Android 6.5.19 candidato locale: 22 test SQLite/Keystore e Activity sul Samsung
  superati. Bozze e allegati sono separati per chat e cifrati; migrazione e
  invio sono recuperabili in caso di errore. Riprodotto il mancato recupero
  di un allegato da 1.5 MB con CursorWindow limitata a 2 MiB: risolto con lettura
  a blocchi sotto transazione. Corretto inoltre un crash da interruzione del
  probe durante ricreazione Activity. Cinque profili visuali PASS; font e
  display originali ripristinati. Screenshot compatto, font grande e landscape
  ispezionati. Questo non certifica ogni combinazione Android o ogni stato UI.
- Correzioni sicurezza nel worktree: nomi sensibili controllati anche tramite
  alias Windows 8.3, junction e operazioni su directory; recupero checkpoint
  mantenuto. Updater verificato con provider NSIS reale e trasporto sintetico:
  non usa metadati di canale diversi da quelli firmati. Cross-review effettuata.
- Suite finale: 920 PASS, 2 skip su 922; check PASS.
  Scanner Grype non attraversava la junction
  del worktree: ora firma, scansione e hash usano lo stesso file risolto; sette
  test mirati PASS. Il gate esperienza ha completato AI e voce, poi il processo
  e terminato con codice -1073740791 entrando nello smoke. Lo smoke ripetuto
  separatamente e passato; la causa dell'interruzione resta indeterminata.
  La conferma del 23 settembre ha superato lo smoke ma incontrato un timeout
  di chiusura a 15 secondi. Retry mirato del 25 settembre PASS senza aumentare
  le soglie. Gate completo del 25 settembre PASS (exit 0): AI, voce, smoke,
  shutdown e soak 250 cicli, zero richieste orfane. Log:
  `qa-artifacts/continuity-experience-sep25.log`. L'esito positivo non dimostra
  la causa dei due precedenti arresti intermittenti: conservarne le evidenze.
- Feedback desktop: rilevato staticamente che "Utile" e "Preferisco questa"
  chiamano il salvataggio dell'esempio di training. Separare il voto dal consenso
  esplicito al contributo e verificare il percorso locale/pubblico prima della
  distribuzione. Non e stata eseguita alcuna raccolta o sessione di training.

Le prove umane di eco/interruzione, le firme e i collaudi esterni richiedono
evidenze reali; le migrazioni grafiche e la matrice completa dei client restano
lavoro di implementazione. Non confondere le due categorie di lavoro residuo.

- Non marcare l'intero programma concluso sulla base di questa sessione.
- Conservare le copie di asset richieste dai packaging: sono derivate intenzionali.
- Non salvare ticket di azioni, consensi o conferme di alimentazione nella navigazione.
- Non pubblicare la Control privata nella release pubblica.
- Non trasformare un test sintetico di voce in una prova di eco reale.
- Non cambiare soglie AI o requisiti di firma per rendere verde un controllo.

Prove locali: `qa-artifacts/continuity-*`, `control1193-*`, `web-bottom-bar`.
Prossimo blocco: confronto componenti/token per singola superficie, matrice di
continuita dei client restanti, prova vocale umana e configurazione sicura delle firme.
