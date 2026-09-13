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
