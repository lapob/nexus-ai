# NexusNXS fuori casa, senza desktop remoto

NexusNXS separa tre capacità che non devono essere confuse:

1. **NexusNXS Android** conversa, usa la voce e continua le chat tramite il servizio pubblico AI.
2. **NexusNXS per PC** è il client privato del proprietario: mostra telemetria, prepara azioni consentite e richiede conferma biometrica prima di eseguirle.
3. **Wake-on-LAN** accende una workstation spenta, ma richiede un dispositivo sempre acceso nella stessa rete fisica del PC.

Nessuna di queste funzioni espone il desktop o una shell arbitraria. Le operazioni sul PC passano sempre da un piano, da una allowlist di strumenti, da un ticket monouso legato al dispositivo associato e dall'audit locale.

## Stato attuale verificabile

Quando la workstation è accesa, NexusNXS per PC usa il gateway privato esistente e offre:

- pairing e sessione protetta nell'Android Keystore;
- rotazione del token e revoca del dispositivo;
- telemetria in background senza ricostruire la schermata;
- riconnessione automatica tra Wi-Fi e rete mobile;
- spegnimento e riavvio con piano, conferma biometrica e audit;
- comando vocale push-to-talk: il testo riconosciuto viene inviato a `/api/actions/plan`, mostrato come anteprima e può raggiungere `/api/actions/execute` soltanto dopo autorizzazione biometrica.

Il riconoscimento vocale del telefono segue la lingua del dispositivo. NexusNXS non mantiene il microfono sempre aperto e non invia un comando direttamente all'esecutore. Il servizio di riconoscimento scelto da Android può essere locale oppure online in base al telefono e alle sue impostazioni; NexusNXS inoltra al gateway privato soltanto il testo restituito dal sistema.

## Perché il PC non può riaccendersi da solo

Quando il PC è completamente spento il gateway NexusNXS non è in esecuzione. Serve quindi un **relay sempre acceso** nella stessa LAN, per esempio un router compatibile, un piccolo computer, un NAS o un Raspberry Pi. Il relay riceve una richiesta privata attraverso Tailscale e invia il magic packet Ethernet alla sola scheda di rete autorizzata.

I moduli `src/remote/wake-on-lan.js` e `src/remote/wake-relay.js` implementano questa parte in sicurezza:

- MAC e destinazioni broadcast sono configurati localmente e validati;
- non accetta hostname o destinazioni indicate dal client;
- espone soltanto target predefiniti, senza rivelarne il MAC;
- ogni richiesta usa un piano a scadenza, monouso e legato al dispositivo;
- il trasporto UDP viene eseguito soltanto dopo conferma esplicita;
- il magic packet viene inviato in un breve burst controllato per migliorare l'affidabilità;
- il relay ascolta soltanto sul loopback e accetta esclusivamente identità aggiunte da Tailscale Serve;
- pairing, token e target sono legati all'identità tailnet approvata e soggetti a limiti di frequenza;
- gli eventi `wake.planned` e `wake.executed` sono disponibili per l'audit del relay.

Il relay HTTP non viene avviato sulla workstation: sarebbe inutile quando la workstation è spenta. Deve essere installato sul nodo sempre acceso solo dopo aver scelto l'hardware. Non contiene una shell, non accetta MAC o broadcast dal telefono e non espone porte sulla LAN o su Internet.

## Installazione del relay privato

1. Copiare `config/wake-relay.example.json` come `config/wake-relay.local.json` sul nodo sempre acceso.
2. Inserire l'identità mostrata da Tailscale, il MAC reale della workstation e il broadcast della LAN. Il file locale è escluso da Git.
3. Validare senza inviare pacchetti:

   ```powershell
   npm run wake:relay:check -- --config config/wake-relay.local.json
   ```

4. Al primo collegamento avviare il relay e creare un codice associato all'identità del proprietario:

   ```powershell
   npm run wake:relay -- --config config/wake-relay.local.json --pair owner@example.com
   ```

5. Sullo stesso nodo pubblicare il solo listener loopback nella tailnet privata:

   ```powershell
   tailscale serve --bg 32147
   tailscale serve status
   ```

Tailscale Serve termina HTTPS, rimuove eventuali header identità forniti dal client e aggiunge `Tailscale-User-Login` soltanto per traffico autenticato della tailnet. Il backend rifiuta richieste senza quell'identità o provenienti da un peer non loopback. **Non usare Tailscale Funnel**, inoltro porte del router, `0.0.0.0` o un reverse proxy pubblico per questo servizio.

Il processo Node deve essere registrato come servizio dell'host o unità `systemd`/attività pianificata con riavvio automatico. Tailscale Serve con `--bg` ripristina la propria configurazione dopo il riavvio, ma non avvia il processo Node al posto del sistema operativo.

## API privata del relay

- `POST /api/pair`: consuma un codice locale e restituisce un token `wake` legato a dispositivo e identità tailnet;
- `GET /api/wake/capabilities`: mostra soltanto ID e nome dei target, mai MAC o broadcast;
- `POST /api/wake/plan`: crea una proposta ad alto rischio, limitata per frequenza;
- `POST /api/wake/execute`: richiede `approved: true` e consuma il ticket anche in caso di rifiuto o errore;
- `POST /api/session/rotate`: ruota il token e annulla eventuali piani ancora aperti.

La revoca viene eseguita localmente dal proprietario e annulla subito i ticket del dispositivo. Stato e token sono conservati soltanto come hash; l'audit concatenato resta sul nodo relay.

## Requisiti hardware da verificare sul PC

- collegamento Ethernet; il Wake-on-WLAN è raramente affidabile;
- Wake-on-LAN abilitato nel BIOS/UEFI;
- nella scheda di rete Windows: risveglio tramite magic packet e autorizzazione a riattivare il computer;
- alimentazione di standby presente dopo spegnimento;
- supporto al risveglio dallo stato desiderato. Il supporto da arresto completo dipende da scheda madre, firmware e impostazioni di avvio rapido.

## Topologia consigliata

```text
NexusNXS per PC (Android)
        |
        | rete privata Tailscale + identità dispositivo
        v
relay sempre acceso nella LAN
        |
        | magic packet soltanto verso il target in allowlist
        v
workstation NexusNXS
        |
        | dopo l'avvio: gateway privato, telemetria e azioni autorizzate
        v
riconnessione automatica dell'app
```

Non sono necessarie porte aperte sul router. Cloudflare resta l'ingresso del servizio AI pubblico; il controllo proprietario e il futuro relay di accensione rimangono nella rete privata Tailscale.

## Passi che richiedono presenza fisica

1. abilitare Wake-on-LAN in UEFI e nella scheda di rete;
2. scegliere il nodo sempre acceso;
3. verificare il magic packet dalla LAN con la workstation in sospensione;
4. installare il relay sul nodo, configurare un solo target, limitare gli accessi con `config/tailscale-grants.example.hujson` e associarlo al telefono;
5. verificare sospensione, ibernazione e arresto separatamente.

Finché questi passaggi non sono completati, l'app deve mostrare il PC come offline e continuare a riconnettersi; non deve simulare un'accensione riuscita.
