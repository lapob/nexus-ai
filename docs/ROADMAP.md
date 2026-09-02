# Roadmap tecnica

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
