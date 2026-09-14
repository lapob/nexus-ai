# Roadmap tecnica

## Priorita prodotto concordate il 13 settembre 2026

Impostazione scelta: inferenza locale predefinita; cloud opzionale, disattivato.
Nessun passaggio automatico a un servizio esterno in caso di errore locale.
Il sito pubblico continua a usare il server NexusNXS esistente: questo non
equivale a eseguire il modello sul telefono o nel browser dell'utente.
Il funzionamento a PC spento richiede un altro nodo sempre acceso, locale
oppure cloud attivato esplicitamente. n8n coordina workflow e integrazioni;
non sostituisce il modello di ragionamento e non garantisce ricavi.

| Priorita | Intervento | Prova necessaria prima della promozione |
| --- | --- | --- |
| 1 | STT locale residente, confronto CPU/GPU e modelli sul dispositivo | Corpus umano separato per lingua/rumore; accuratezza e latenza a freddo/caldo; nessuna regressione rispetto al backend corrente |
| 2 | Interruzione vocale durante TTS, riconoscimento delle correzioni e ripresa | Test con speaker e cuffie; nessuna auto-interruzione dovuta alla propria voce; stop media e richieste tardive |
| 3 | Memoria correggibile e con provenienza, scadenza e revoca | Edit/cancel/persistenza via IPC reale; nessuna commistione con training o altre identita |
| 4 | Ragionamento adattivo e retrieval | Confronto cieco su domande reali, fonti corrette, rispetto dei limiti di tempo e scelta manuale del livello |
| 5 | Azioni con esito osservabile, checkpoint e rollback | Distinguere successo, errore, annullamento e consenso negato; nessuna ripetizione di effetti dopo riconnessione |
| 6 | Iniziativa selettiva e lavoro persistente | Orari silenziosi, deduplica limitata, revoca, budget e scadenza; niente messaggi esterni senza autorizzazione |
| 7 | Training mirato | Dati approvati, separazione train/validation/test, confronto con baseline; nessuna promozione automatica |

La sessione vocale web continua e l'editor desktop dei ricordi riusano i
componenti esistenti. I test sintetici della voce verificano il lifecycle;
non dimostrano naturalezza o precisione su un microfono reale. Non pubblicare
come acquisita una parita con assistenti commerciali.

### Perfezionamenti profondi successivi

- Una conversazione unica tra testo, voce e immagini, con artefatti persistenti
  soltanto negli account o dispositivi autorizzati. La demo anonima resta temporanea.
- Un registro delle attivita accessibile su richiesta: cosa e stato fatto,
  quale risultato e stato verificato, cosa resta da decidere. Mostrare progressi
  reali, senza percentuali simulate o catene di ragionamento interne.
- Ricordi con origine visibile e differenza prima/dopo; aggiornamenti contestuali
  espliciti, senza inferire emozioni, salute o caratteristiche sensibili.
- Controlli contestuali invece di nuove barre: Core per la voce, composer per
  scrivere, dettaglio delle attivita soltanto quando serve.
- Un solo vocabolario di icone, spaziature e movimento; transizioni basate sullo
  stato, illuminazione leggibile, riduzione movimento e target tattili accessibili.
- Calibrare la personalita: cordiale, coerente e capace di dissentire; dichiarare
  incertezze e limiti senza fingere coscienza, emozioni umane o azioni mai eseguite.
- Servizio personale sempre acceso come opzione distinta, con identita dei
  dispositivi, code a scadenza e isolamento tra utenti prima delle integrazioni n8n.

Queste sono priorita e criteri di accettazione, non un elenco di funzioni tutte
gia implementate. Lo stato verificato e mantenuto in CONTINUITA.md alla radice.

## Foundation

- Git, ignore e baseline riproducibile;
- configurazione validata e doctor offline;
- contratti IPC, logging ed error model;
- documentazione e confini architetturali.

## Knowledge Core

- parser Markdown, esclusioni, provenienza e aggiornamento incrementale
  (implementati);
- normalizzazione di frontmatter e wikilink (implementata, da ampliare solo con
  fixture reali che espongono nuovi casi);
- indice persistente riutilizzabile tra gli avvii (implementato);
- graph derivato dalla vault (implementato);
- retrieval ibrido con fallback lessicale (implementato); resta da ampliare la
  suite di valutazione semantica multilingue.

## Platform

- persistenza di conversazioni, progetti e artefatti;
- provider abstraction per runtime locali;
- capability, consenso monouso, scadenza, binding al dispositivo e audit
  (implementati);
- cancellazione processi e checkpoint/rollback (implementati); restano manifest
  di integrazione firmati e una UI di revoca centralizzata.

## Agent Runtime

Il runtime multi-step limitato da budget, con consenso esplicito, checkpoint e
annullamento, costituisce la baseline attuale. Le prossime milestone sono
workspace Git con diff semantici, strumenti dichiarativi più estesi, eval per
ogni capability e agenti specializzati confinati. Ogni azione mantiene scope
revocabili, audit e approvazioni.

## Continuità remota

Il client privato supporta pairing revocabile, conversazioni, riconnessione dopo
un cambio rete e conservazione locale della bozza. Le prossime milestone sono
streaming incrementale, notifiche opzionali e sincronizzazione cifrata degli
allegati esplicitamente selezionati. Il gateway non viene esposto pubblicamente.

## Presenza Jarvis e trasporto remoto

La presenza ambientale resta una funzione esplicita, visibile e revocabile. Il
push-to-talk è sempre disponibile; l'eventuale parola di attivazione viene
riconosciuta sul dispositivo e non può avviare operazioni sensibili senza una
seconda conferma. Microfono, ascolto e trasmissione devono avere stati distinti.

Il trasporto remoto segue una gerarchia unica dietro la stessa interfaccia:

1. collegamento diretto nella LAN quando è autenticato;
2. Tailscale Serve per il controllo privato del proprietario;
3. futuro relay NexusNXS con connessioni soltanto in uscita, cifratura
   end-to-end e code a scadenza per il prodotto pubblico.

Il servizio AI pubblico e il canale di controllo non condividono token, scope o
listener. Wake-on-LAN richiede un nodo fidato sempre acceso nella LAN e accetta
soltanto target locali in allowlist. Non vengono aperte porte sul router e non
esiste una shell remota generica.

## Parità funzionale misurabile

La parità con assistenti avanzati non viene dichiarata per somiglianza grafica.
Viene misurata su coding, uso strumenti, retrieval con provenienza, continuità
conversazionale, file multimodali, latenza, sicurezza e capacità di recupero.
Ogni nuova funzione deve aggiungere casi di valutazione e una soglia di release.

## Priorità verso un assistente di riferimento

### Piano di completamento verificabile — 13 settembre 2026

Locale rimane il percorso predefinito. Il cloud resta opzionale e spento;
una macchina completamente spenta non può eseguire attività: serve un nodo
locale sempre acceso oppure un servizio esterno scelto esplicitamente.
L'identità cosmica è una scelta grafica, non una promessa di coscienza,
onniscienza o capacità che il sistema non possiede.

| Area | Intervento proposto | Criterio di accettazione |
| --- | --- | --- |
| Conversazioni | Un solo modello di messaggio per testo, voce, file e immagini; ID stabili e diramazioni esplicite | Modifica, retry e cambio rete non duplicano turni; nessuna perdita di allegati o bozza |
| Voce | STT residente, misurazione separata di acquisizione/rete/trascrizione; cancellazione TTS e barge-in con gestione dell'eco | Corpus di persone reali e microfoni diversi; interruzione non provocata dalla voce sintetica; nessun audio dopo uscita |
| Ragionamento | Auto sceglie il budget in base al compito; rapido e approfondito restano override comprensibili | Qualità misurata su richieste brevi, codice, documenti, ambiguità; risposta verificata prima di dichiarare esecuzioni |
| Memoria | Ricordi con origine, ambito personale/progetto, scadenza e modifica; sincronizzazione solo autenticata | Isolamento tra utenti, revoca e cancellazione verificati su tutti i client |
| Azioni | Piano breve, anteprima, autorizzazione limitata, checkpoint, ricevuta e annullamento | Revoca durante esecuzione, riavvio e ripresa non aggirano il consenso; risultati confrontati con stato reale |
| Proattività | Routine disattivate inizialmente, trigger espliciti, fasce silenziose e limite di frequenza | Nessuna azione esterna o ascolto implicito; arresto e disattivazione immediati |
| Dashboard | Amministrazione autenticata con sessioni attive, dispositivi, capacità, code, latenza ed errori aggregati | Nessun contenuto delle chat nelle metriche; contatori di sessioni non presentati come persone uniche |
| Dati | Mappa di conservazione, esportazione completa, cancellazione a scadenza effettiva e drill di ripristino | Backup comprende chat archiviate e metadati; cancellare una chat elimina figli e richieste pendenti |
| Immagini | Job persistente con stato reale, anteprima/download e modifiche collegate al risultato originale | Retry senza doppia generazione; cancellazione libera risorse; URL e file isolati per utente |
| Affidabilità | Coordinare warm-up e valutazioni evitando contendere lo stesso runtime con la produzione | Cold start, timeout e recupero misurati; nessuna falsa readiness; rollback firmato verificato |

Per la grafica: un solo catalogo di font, spaziature, luminosità e raggi;
composer di larghezza limitata con comandi progressivi, senza toolbar affollate;
Core con geometria invariata e stati guidati da eventi reali. Lo stato di errore
deve offrire una sola azione utile senza sostituire la scena con pannelli tecnici.
Animazioni iniziali una sola volta, reduced-motion rispettato e illuminazione
locale per hover/focus; mantenere il focus visibile per chi usa la tastiera.
Su mobile lo spazio segue tastiera, safe area e orientamento; desktop sfrutta
lo spazio per chat e contenuti di lavoro senza gonfiare il campo di scrittura.

Prima di nuove funzionalità: chiudere verifica fisica Android, scan Security
integrale e latenza vocale. Dopo: continuità autenticata e dashboard; infine
routine e integrazioni. Queste righe sono proposte e criteri, non funzionalità
già consegnate. Non aggiungere controlli grafici senza backend funzionante.

### P0 — Qualità percepita ogni giorno

- coordinatore di warm-up per ridurre il primo token di AI e la prima frase TTS
  senza tenere inutilmente sotto carico CPU e GPU;
- benchmark STT multilingue su voci, microfoni, rumore e distanze reali, con
  calibrazione automatica e regressioni bloccanti;
- aggiornamenti firmati, ripristino della release precedente e diagnostica
  esportabile senza mostrare dati tecnici nell'esperienza ordinaria.
- turn-taking vocale con VAD, barge-in, deduplicazione e una sola voce coerente
  fra desktop e mobile;
- ricevuta strutturata per ogni azione con risultato, verifica e rollback
  disponibile, senza percorsi o segreti nell'interfaccia pubblica.

### P1 — Lavoro affidabile nel tempo

- progetti persistenti con cartella, obiettivo, permessi e contesto espliciti;
- attività lunghe con piano, checkpoint, pausa, ripresa e riepilogo verificabile;
- memoria modificabile dall'utente, con provenienza, scadenza, cancellazione e
  supersessione conservativa (implementata; resta la sincronizzazione opzionale);
- identità Android per dispositivo basata su Android Keystore e challenge
  monouso (implementata; resta l'attestazione hardware come hardening opzionale);
- routine proattive opzionali, con orario, trigger, ambito, anteprima e pulsante
  di arresto immediato.

### P2 — Capacità avanzate

- input multimodale con immagini, documenti e audio, sempre con provenienza;
- ricerca web e automazione del browser isolate, osservabili e revocabili;
- continuità cifrata tra desktop e mobile con sincronizzazione selettiva e
  funzionamento locale quando la workstation non è raggiungibile.
- relay pubblico multi-dispositivo con messaggi cifrati end-to-end e
  conservazione minima a scadenza;
- comprensione dello schermo e della finestra attiva soltanto su richiesta,
  preferendo struttura accessibile e metadati alle catture complete.

## Piano operativo Jarvis — revisione 14 settembre 2026

Questa sezione integra la roadmap esistente e ne ordina il completamento.
È un piano, non una dichiarazione di funzioni già consegnate. Baseline sorgente:
bd77147. Il checkpoint CONTINUITA.md conserva prove e pubblicazioni correnti.

### Prima consegna: esperienza quotidiana affidabile

1. Completare la voce full-duplex: ascolto anche durante generazione e sintesi,
   interruzione immediata, gestione dell'eco, pause naturali, correzioni e
   cancellazione delle risposte obsolete. Il prototipo web attuale è opt-in
   locale e ascolta durante playback con AEC; la prova umana Windows è pendente.
   Estendere a desktop e Android soltanto dopo corpus reale e prove speaker,
   cuffie, Bluetooth, rumore, uscita e perdita della rete.
2. Ridurre la latenza misurando primo token, prima frase udibile, durata STT,
   interruzione e code p50/p95 su hardware dichiarato. Warm-up controllato,
   streaming e cancellazione devono riusare il runtime esistente. I target
   numerici vanno fissati dopo la baseline; nessuna promessa universale.
3. Chiudere collaudo fisico Android, aggiornamenti con firme e provenienza
   coerente, ripristino della versione precedente e audit sicurezza integrale.
   L'ultimo audit registrato ha 2 criteri conformi e 13 bloccati: non è ancora
   una Stable pronta alla vendita. I 878 test del checkpoint precedente non
   sostituiscono prove acustiche, sicurezza completa e test su dispositivi reali.

### Seconda consegna: un assistente che ricorda e porta a termine

4. Unificare conversazioni, voce, allegati e progetti: modifica del messaggio,
   rigenerazione, ricerca nella cronologia, esportazione, cancellazione e
   ripresa senza duplicare risposte o azioni. La demo anonima resta temporanea.
5. Completare la memoria personale e di progetto con origine, correzione,
   scadenza e sincronizzazione autenticata opzionale. Riutilizzare l'editor
   esistente; verificare isolamento e revoca su tutti i client.
6. Rendere i lavori lunghi persistenti: obiettivo, avanzamento reale, pausa,
   ripresa, annullamento e risultato verificato. Preferire API e strumenti
   strutturati; usare browser e computer in ambienti confinati quando necessario.
   Per il codice: workspace isolato, diff, test e revisione prima della consegna.
7. Completare documenti e immagini: lettura con riferimenti alle fonti,
   artefatti modificabili, generazione e modifica immagini, originali e download,
   job persistenti e retry senza doppie generazioni. Animazione cosmica legata
   allo stato effettivo; nessuna percentuale inventata.

### Terza consegna: integrazioni e iniziativa controllabile

8. Collegare un catalogo reale di plugin/MCP con installazione, stato,
   autenticazione, permessi minimi, revoca, versioni e gestione degli errori.
   Separare strumenti, applicazioni rilevate e integrazioni connesse. La nuova
   sezione impostazioni è una base; non dimostra un marketplace funzionante.
9. Integrare n8n come esecutore di routine autorizzate: calendario, documenti,
   riepiloghi e monitoraggi. Prevedere chiavi protette, webhook autenticati,
   timeout, deduplicazione, registro esiti e arresto. Nessun invio esterno
   senza autorizzazione. Verificare licenze prima di offrire servizi commerciali.
10. Aggiungere proattività opzionale con orari silenziosi, limiti di frequenza,
    anteprima e notifiche soltanto utili. Schermo, microfono e domotica richiedono
    ambiti espliciti e revocabili. Un altro nodo acceso è indispensabile per
    lavorare quando il PC è spento; il cloud rimane opzionale e disattivato.

### Grafica e impostazioni comuni

- Un solo sistema di font, icone, spaziature e stati; riutilizzare i componenti.
- Composer compatto, comandi contestuali e livello di ragionamento discreto.
- Core con geometria preservata, stati reali, hit area coerente e nessun salto
  dimensionale passando tra ascolto, risposta ed errore.
- Menu mobile progressivo, safe area e tastiera senza collisioni; verificare
  zoom del testo, orientamento, contrasto e movimento ridotto. Conservare un
  focus elegante ma riconoscibile per chi naviga da tastiera.
- Impostazioni raggruppate in conversazioni/memoria, voce, connessioni,
  automazioni/attività, privacy/dispositivi e aspetto. Mostrare solo capacità
  effettive, con azioni chiare di recupero quando un servizio non è disponibile.

### Intelligenza e sostenibilità

Migliorare prima selezione del modello, retrieval, strumenti e valutazioni su
compiti reali. Il training deve partire da dati autorizzati e revisionati,
con test separato, confronto cieco e rollback. Like/dislike non equivalgono a
consenso al training; cambiare nome o versione non prova maggiore intelligenza.
L'ultimo inventario nel checkpoint riporta solo 2 esempi approvati: ricontrollare
il dataset prima di pianificare un addestramento. Non promettere equivalenza
con modelli proprietari mediante solo fine-tuning locale.

Per una seconda entrata, ipotesi da validare: assistenza privata su documenti
per piccoli studi, preparazione di report o automazioni amministrative con
revisione umana. Scegliere un caso d'uso iniziale, provare con utenti pilota e
misurare tempo risparmiato, successo dei compiti, assistenza necessaria e costo
per attività. Prezzi e ricavi richiedono dati reali; nessuna garanzia di guadagno.
Prima di clienti paganti: isolamento utenti, mappa dei dati, esportazione e
cancellazione, backup esterno verificato, aggiornamenti sicuri e supporto.

### Criterio comune di completamento

Ogni voce richiede backend reale, interfaccia, annullamento/error handling,
verifica pertinente e checkpoint con revisione e limiti. Non chiudere una voce
perché esiste un pulsante o perché passa una simulazione. Il prossimo passo
resta la prova vocale Windows e la chiusura della baseline, poi continuità e
strumenti. Jarvis indica l'esperienza desiderata, non coscienza o infallibilità.

### Riferimenti tecnici consultati

Le piattaforme attuali combinano modelli con strumenti, ricerca, esecuzione e
integrazioni. Questi riferimenti guidano i requisiti; non provano che Nexus
possieda le stesse capacità o debba adottare un backend cloud.

- OpenAI, strumenti: https://developers.openai.com/api/docs/guides/tools
- OpenAI, conversazioni realtime: https://developers.openai.com/api/docs/guides/realtime-conversations
- MCP, introduzione: https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro
### Flusso unico e ampliamento delle capacità digitali

Contratto comune da completare riusando runtime, chat e registro delle azioni:
richiesta -> contesto autorizzato -> strumenti disponibili -> esecuzione ->
verifica del risultato -> artefatto/ricevuta nella stessa conversazione.
Testo e voce sono ingressi dello stesso flusso; cambiare modalità non crea
un nuovo progetto o perde il lavoro. Stato e annullamento devono provenire
 dall'esecuzione reale, non da timer grafici.

Prima correzione applicata: il Core richiama stopGeneration durante una
risposta in corso, riutilizzando l'annullamento della chat; la sessione vocale
può acquisire il turno seguente. Non è interruzione vocale durante inferenza:
quella resta da realizzare e validare.

Capacità successive, da consegnare una alla volta con percorsi completi:

| Famiglia | Risultato per l'utente | Confine di completamento |
| --- | --- | --- |
| Ricerca e studio | Confrontare fonti, interrogare documenti, preparare dossier | Citazioni verificabili, fonti mancanti dichiarate, file finale |
| Ufficio | Creare e modificare testi, fogli di calcolo e presentazioni | Formule e layout controllati; anteprima ed esportazione |
| Sviluppo | Analizzare repository, correggere bug, eseguire test | Ambiente isolato, diff, log e risultato riproducibile |
| Organizzazione | Appuntamenti, attività, preparazione di riunioni | Account collegati, fusi orari, conflitti e duplicati gestiti |
| Comunicazioni | Preparare risposte e riepiloghi | Destinatario e contenuto verificati, invio autorizzato |
| Creatività | Immagini, varianti, revisione di contenuti e media | Versioni, originali, download e gestione dei job |
| Computer personale | Organizzare file e operare sulle app autorizzate | Ambito selezionato, anteprima per modifiche distruttive, recupero |
| Routine | Report periodici, controlli e notifiche utili | Nodo acceso, scadenze, revoca, deduplicazione e ricevute |

Questa tabella è backlog, non un catalogo di funzioni già operative.
Ogni famiglia deve dichiarare piattaforme supportate, requisiti hardware,
modalità locale/cloud, dati trattati e limiti; nascondere comandi non collegati.
La dashboard amministrativa mostra salute e utilizzo aggregati: non deve
trasformarsi in un accesso indiscriminato alle conversazioni personali.