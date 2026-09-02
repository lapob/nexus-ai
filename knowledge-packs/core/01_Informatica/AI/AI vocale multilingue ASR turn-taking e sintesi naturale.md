---
title: AI vocale multilingue: ASR, turn-taking e sintesi naturale
type: technical-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-08-15
updated: 2026-08-15
source_kind: curated-synthesis
tags: [speech, asr, tts, vad, voice, multilingual, evaluation]
aliases: [AI vocale, Speech AI, ASR e TTS]
---

# AI vocale multilingue: ASR, turn-taking e sintesi naturale

## Visione d'insieme

Una conversazione vocale credibile è un sistema real-time, non la semplice unione di riconoscimento e sintesi:

```text
microfono -> acquisizione -> normalizzazione prudente -> VAD
           -> segmentazione -> ASR -> lingua e confidenza
           -> dialogo e strumenti -> testo parlato -> TTS -> uscita
                ^                                      |
                +---------- interruzione --------------+
```

Ogni stadio ha stato, latenza ed errori propri. Il visualizer deve reagire all'inviluppo audio locale; la decisione di fine turno deve dipendere dalla voce; la risposta testuale non deve aspettare la sintesi completa.

## Acquisizione indipendente dall'hardware

- seguire il dispositivo predefinito del sistema, ma permettere una scelta esplicita;
- enumerare gli ingressi tramite identificatori stabili, non posizione nella lista;
- negoziare il formato supportato e convertire internamente a PCM mono coerente;
- evitare gain automatico aggressivo: amplifica anche ventole, eco e rumore elettrico;
- conservare un breve *preroll* per non perdere la prima sillaba;
- rilevare cambio dispositivo, sospensione, revoca del permesso e perdita del flusso;
- non aprire due catture concorrenti per visualizer e trascrizione.

La prova microfono deve mostrare livello, rumore di fondo, clipping e voce rilevata senza inviare audio né avviare l'assistente.

## Livello audio e visualizzazione

Usare RMS o loudness a finestre brevi, con noise floor adattivo e limiter. La risposta visiva necessita di due costanti:

- **attack** rapido ma non istantaneo, per seguire l'inizio delle parole;
- **release** più lento, per evitare tremolio tra sillabe.

Applicare una curva compressiva, ad esempio logaritmica o `sqrt`, dopo aver sottratto il noise floor. Piccole variazioni della voce non devono saturare l'intera scena. Il rendering consuma soltanto un valore normalizzato e smussato: non deve leggere o ricampionare il microfono autonomamente.

## Voice activity detection

Il VAD distingue parlato probabile da silenzio o rumore, ma non comprende la frase. Una decisione robusta combina:

- energia relativa al rumore ambientale;
- probabilità del modello VAD;
- durata minima di attività;
- isteresi tra soglia di ingresso e uscita;
- *hangover* dopo l'ultima sillaba;
- segnali dell'ASR, come una trascrizione parziale stabile.

Fischi, click e musica possono superare la soglia energetica. Non inviare un turno se il segmento è troppo breve, la probabilità di parlato è bassa o l'ASR produce soltanto token instabili.

## Fine turno naturale

Una pausa non equivale sempre alla fine della frase. Considerare:

- durata della pausa;
- punteggiatura e completezza sintattica della trascrizione parziale;
- parole sospese come congiunzioni e preposizioni;
- ritmo recente dell'utente;
- richiesta esplicita di invio;
- limite massimo del turno.

Usare una finestra più lunga dopo una frase incompleta e più breve dopo una conclusione chiara. Il timer deve essere unico e cancellabile: due timer concorrenti causano input duplicati e riaperture dell'ascolto.

## Riconoscimento multilingue

### Strategia

1. mantenere modalità automatica come default;
2. usare lingua dell'interfaccia come prior debole, non come vincolo;
3. stabilizzare la lingua su più segmenti prima di cambiarla;
4. consentire una lingua bloccata per dettatura specialistica;
5. mantenere nomi propri e termini tecnici tramite vocabolario contestuale prudente;
6. conservare il testo originale e applicare correzioni soltanto ad alta confidenza.

Whisper è un modello multitask per riconoscimento multilingue, traduzione e identificazione della lingua. La robustezza del modello non elimina la necessità di testare microfoni, accenti, rumore ed echo reali.

### Errori tipici

| Sintomo | Possibile causa | Verifica |
|---|---|---|
| manca l'inizio | nessun preroll o backend avviato tardi | impulse e prime sillabe |
| parole duplicate | segmenti sovrapposti o callback tardivi | ID univoci e timeline |
| lingua sbagliata | decisione su audio troppo breve | confidenza per segmento |
| parole inventate nel silenzio | noise floor o prompt ASR eccessivo | clip negative |
| frase troncata | endpoint troppo rapido | pause naturali |
| ritardo crescente | code non limitate | backlog e timestamp |

## Echo, output e barge-in

Durante la sintesi, il microfono può catturare la voce dell'assistente. Le opzioni sono:

- acoustic echo cancellation del sistema;
- cuffie o routing separato;
- riferimento dell'audio riprodotto per l'echo canceller;
- *ducking* della sintesi quando l'utente inizia a parlare;
- esclusione prudente dei segmenti troppo simili al testo appena pronunciato.

Non disattivare ciecamente il microfono durante tutto il TTS: impedirebbe l'interruzione naturale. Il *barge-in* deve fermare lo stesso motore vocale attivo, scartare callback tardivi e aprire un solo nuovo turno.

## Sintesi naturale

Il testo destinato allo schermo non coincide con quello da pronunciare. Prima del TTS:

- espandere abbreviazioni soltanto quando non ambigue;
- convertire markup, URL, emoji e codice in una forma parlata sensata;
- normalizzare Unicode e lettere accentate senza trasformarle in entità;
- dividere per unità prosodiche, non per lunghezza fissa;
- assegnare pause a virgole, incisi, elenchi e cambio argomento;
- mantenere una sola voce per sessione salvo scelta esplicita.

Per risposte lunghe, pronunciare una sintesi autonoma e naturale, quindi indicare che i dettagli sono disponibili sullo schermo. La frase di transizione non deve interrompere a metà un concetto.

## Streaming e latenza

Misurare separatamente:

- tempo all'apertura del microfono;
- tempo alla prima trascrizione parziale;
- ritardo di endpointing;
- time-to-first-token del modello;
- tempo al primo chunk audio;
- real-time factor del TTS;
- latenza di interruzione.

Una pipeline percepita come rapida mostra subito uno stato reale, trascrive progressivamente e sintetizza per frasi mentre il testo continua. Non deve simulare avanzamento se il backend non ha prodotto eventi.

## Dataset di valutazione

Creare un corpus con consenso e provenienza che incroci:

- lingue, accenti e code-switching;
- voce bassa, normale e forte;
- microfoni integrati, USB, Bluetooth e virtuali;
- stanze silenziose, ventole, strada, musica e altre voci;
- frasi brevi, numeri, date, acronimi, codice e nomi propri;
- pause naturali, autocorrezioni e interruzioni del TTS;
- clip negative senza parlato.

Separare persone e ambienti tra training e test. Non usare registrazioni della stessa persona in entrambi gli split se si vuole misurare generalizzazione.

## Metriche

- **WER** per parole e **CER** per lingue o testi in cui la segmentazione è difficile;
- language identification accuracy e stabilità tra segmenti;
- false accept e false reject del VAD;
- first-word clipping e tail truncation rate;
- duplicate-turn rate;
- endpoint latency e barge-in latency;
- intelligibilità, naturalezza e preferenza del TTS con ascolto cieco;
- percentili p50, p95 e p99, non soltanto la media.

La normalizzazione usata per WER va documentata: ignorare accenti o punteggiatura può nascondere errori importanti per l'utente.

## Privacy e sicurezza

- elaborare localmente quando promesso;
- chiedere consenso prima di conservare clip;
- indicare chiaramente quando il microfono è aperto;
- applicare retention breve e cancellazione verificabile;
- non usare automaticamente le conversazioni per training;
- trattare il testo riconosciuto come input non fidato prima di eseguire strumenti;
- richiedere conferma per azioni sensibili anche se il comando vocale sembra certo.

## Gate di accettazione

1. nessuna doppia cattura o doppio turno;
2. nessuna prima sillaba persa nel corpus di riferimento;
3. nessuna allucinazione sulle clip negative accettate;
4. cambio lingua stabile e controllabile;
5. interruzione TTS verificata durante cold e warm start;
6. output audio valido per tutte le voci distribuite;
7. degradazione chiara, non crash, quando un backend manca;
8. prova su almeno un dispositivo per classe hardware supportata;
9. metriche salvate per versione e confronto con la baseline;
10. verifica manuale di naturalezza da ascoltatori reali.

## Fonti primarie

- [OpenAI Whisper — repository e model card](https://github.com/openai/whisper)
- [Robust Speech Recognition via Large-Scale Weak Supervision](https://cdn.openai.com/papers/whisper.pdf)
- [W3C — Web Audio API](https://www.w3.org/TR/webaudio-1.0/)
- [Google Research — AudioSet](https://research.google.com/audioset/)
- [Microsoft — SpeechT5](https://github.com/microsoft/speecht5)

## Collegamenti

- [[Dataset training e post-training dei modelli generativi]]
- [[Evaluation safety e red teaming per AI]]
- [[MLOps versionamento deployment e monitoraggio]]
- [[Agenti tool use pianificazione e consenso]]
