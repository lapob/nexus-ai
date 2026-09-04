# Preview 0.3.8 / Android 6.4.2

## Modifiche

- Android: menu impostazioni a tre linee, scomparsa dopo sei secondi di inattivita;
  resta accessibile con esplorazione tattile. Renderer Markdown nella shell Instant.
- Android: integrazione opt-in con il ruolo assistente, sessione vocale e riuso
  di un provider di riconoscimento installato; nessun ascolto autonomo in background.
  L'assegnazione del tasto laterale dipende dal sistema e dal produttore.
- Desktop: avvio cosmico senza attese artificiali; Presence compatta con UI aperta,
  espansa in tray, trascinabile fra monitor, con transizione di posizione/dimensione.
- Web AI: base nera continua dietro comandi e avvertenze, misura dinamica delle
  altezze e spazio riservato alla fine delle risposte.

## Verifiche e limiti

- 799 test Node superati; build, TypeScript, controlli di pubblicazione e installer.
- Verifica esperienza: AI 8B 16/18 e 14B 18/18; voce, Electron, chiusura e 250 cicli
  senza richieste orfane. Questi campioni non dimostrano accuratezza universale.
- Presence provata in Electron, con catture dock/tray e trascinamento simulato.
- Fondo web verificato nel browser a 390x844, 360x420 e 1440x900.
- Android: compilazione, lint e firma Preview verificati. Telefono ADB non rilevato:
  tasto laterale, dialogo del ruolo e voce sul telefono restano da provare fisicamente.
- Windows senza certificato editore; APK firmato Debug, non versione Play Store.
- Sito principale: 28 test e 16 prove browser superate localmente; pubblicazione
  bloccata dal timeout dell'audit npm, senza aggirare il controllo.
- Runtime Ollama di sviluppo con segnalazioni di sicurezza a livello di modulo:
  mantenuto solo su loopback ed escluso dall'installer pubblico.

Non considerare questo riepilogo una certificazione di assenza di bug o di sicurezza.
