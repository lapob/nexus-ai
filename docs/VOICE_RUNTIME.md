# Runtime vocale

NEXUSNXS separa acquisizione, trascrizione e risposta parlata. Questa distinzione
permette di interrompere ogni fase senza lasciare processi o audio in coda.

## Flusso

```text
Microfono WebAudio
  -> VoiceRecognition (livello e visualizer)
  -> NativeSpeechService (Whisper.cpp, fallback Windows)
  -> AI locale
  -> prepareSpokenText (riepilogo per la voce)
  -> NeuralSpeechService (Kokoro) o SpeechSynthesis Windows
```

La risposta completa resta visibile. La sintesi legge al massimo due frasi,
rimuove codice, URL, tabelle Markdown, emoji e percorsi locali, quindi segnala
quando i dettagli restano sullo schermo.

## Interruzione e concorrenza

- ogni risposta parlata riceve un identificatore di sessione;
- il VAD calibra il rumore di fondo, verifica energia nelle frequenze vocali e
  richiede più campioni coerenti prima di considerare iniziata una frase;
- dopo circa 680 ms senza voce effettiva richiede a Whisper di finalizzare il
  testo parziale; `finish` conserva la trascrizione, mentre `stop` la annulla;
- rumore senza parole non prolunga l'ascolto e dopo otto secondi la sessione
  termina senza inviare una richiesta vuota al modello;
- una nuova richiesta, `Spazio`, `Escape`, la pausa voce o la privacy invalidano
  subito la sessione precedente;
- Kokoro applica la politica `last-one-wins`: non mantiene una coda di risposte;
- timer, file WAV parziali e Promise pendenti vengono chiusi durante lo stop;
- un WAV completato in ritardo non può più iniziare la riproduzione.

## Voce italiana

Kokoro usa `im_nicola` o `if_sara` e segmenti brevi. Le pause dipendono dalla
punteggiatura, così il ritmo non è uniforme. Il motore viene caricato soltanto
alla prima richiesta neurale esplicita, evitando di occupare centinaia di MB
durante le sessioni che usano esclusivamente la voce di sistema.

Il dialogo avviato dal microfono usa sempre la migliore voce italiana di Windows:
su CPU Kokoro impiega diversi secondi anche dopo il warm-up e interromperebbe il
ritmo della conversazione. Kokoro resta disponibile per risposte non live e
anteprime, secondo la preferenza scelta nelle impostazioni.

Chatterbox è integrato come modalità locale sperimentale `Espressiva`, ma viene
esposto soltanto su profilo `performance` con opt-in
`NEXUS_ENABLE_EXPRESSIVE_VOICE=1`. Il runtime PyTorch presente è CPU-only e nel
benchmark reale non ha completato una frase breve entro 120 secondi: abilitarlo
di default renderebbe l'app più lenta e calda. Non viene usato nel dialogo
realtime e non sostituisce automaticamente Kokoro. Nel setup pubblico resterà
un componente opzionale finché un runtime GPU verificato non offrirà latenza,
dimensioni e fallback adatti alla distribuzione generale.

## Verifica

```powershell
node --test tests/neural-speech.test.js
npm run typecheck
npm run verify
```
