# Protocollo di accettazione vocale

La sintesi e il riconoscimento sono verifiche distinte. `npm run voice:evaluate` controlla che la voce neurale locale produca audio valido, naturale e senza richieste duplicate. Il riconoscimento richiede registrazioni reali, perché un campione sintetico non rappresenta microfono, ambiente o pronuncia dell'utente.

Il corpus di accettazione deve contenere almeno:

- italiano, inglese, spagnolo, francese e tedesco;
- voce bassa, normale e sostenuta senza gridare;
- distanza di circa 30 cm, 1 m e 2 m;
- silenzio, ventola del PC, musica tenue e rumore domestico;
- pause naturali, lettere accentate, nomi di app e termini tecnici;
- almeno tre dispositivi di ingresso differenti quando disponibili.

Ogni WAV deve avere nel dataset il testo atteso e la lingua. Il gate si esegue con:

```powershell
npm run voice:evaluate:stt -- --dataset=<dataset.json>
```

Il dataset è un array JSON. I percorsi sono relativi al file del dataset e non
possono uscire dalla sua cartella:

```json
[
  {
    "file": "audio/it-voce-normale.wav",
    "kind": "speech",
    "text": "Apri le impostazioni della voce",
    "language": "it",
    "speaker": "speaker-a",
    "device": "microfono-usb",
    "environment": "quiet"
  }
]
```

Il comando rifiuta file mancanti, vuoti, troppo grandi o con formato diverso da
WAV; produce inoltre accuratezza complessiva e per lingua. La soglia di rilascio
predefinita è 85% e può essere resa più severa con `--min-accuracy=90`.

Non si dichiara “riconoscimento perfetto” senza misurare la Word Error Rate sul corpus reale. Le registrazioni restano locali e non entrano nella build.
