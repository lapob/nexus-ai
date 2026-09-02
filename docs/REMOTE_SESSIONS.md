# Sessioni remote NexusNXS

La sessione remota permette a un dispositivo associato di consultare la cronologia e continuare una conversazione usando l'AI e le risorse della workstation NexusNXS. È disattivata per impostazione predefinita.

## Collegamento in casa

1. Apri **Impostazioni → Remoto** e premi **Attiva**.
2. Premi **Usa dal telefono**, quindi **Prepara rete di casa** e approva la richiesta di Windows.
3. Collega PC e telefono alla stessa rete Wi-Fi privata.
4. Premi **Collega telefono** e scansiona il QR.

NexusNXS preferisce automaticamente la scheda di rete fisica ed evita, quando possibile, adattatori VirtualBox, WSL, Docker e VPN. La regola Windows viene applicata soltanto alle reti classificate come private. Non abilitarla su Wi-Fi pubblici.

## Collegamento fuori casa

1. Installa Tailscale sul PC e sul telefono e accedi allo stesso account.
2. Lascia attivo il servizio headless NexusNXS; l'interfaccia desktop può restare chiusa.
3. In **Impostazioni → Remoto**, premi **Configura fuori casa**. Se compare una pagina di autorizzazione, completala e premi di nuovo il pulsante.
4. Premi **Collega telefono** e scansiona il nuovo QR.

NexusNXS usa Tailscale Serve per offrire il client remoto in HTTPS soltanto ai dispositivi del tuo spazio privato. Non inoltrare la porta NexusNXS sul router.

Abilitare **Device approval** nella console Tailscale e applicare una policy Grants
deny-by-default basata su `config/tailscale-grants.example.hujson`. Il telefono
deve raggiungere esclusivamente la porta HTTPS 443 della workstation: la porta
locale 32145 non deve essere concessa direttamente.

Il PC deve restare acceso, connesso a Internet e con NexusNXS in esecuzione. Anche il telefono deve avere Tailscale connesso quando è fuori dalla rete domestica. Se Windows sospende il computer, la sessione non può rispondere: configura la workstation perché non vada in sospensione quando deve restare raggiungibile.

## Ingresso pubblico gratuito

Tailscale Funnel pubblica NexusNXS per Android su HTTPS 8443 usando il nome stabile della
workstation nel dominio `*.ts.net`. Funnel inoltra esclusivamente al listener
guest `127.0.0.1:32147`; Serve continua a inoltrare il traffico privato al
gateway `127.0.0.1:32145` sulla porta HTTPS 443.

Il listener pubblico non può raggiungere `/console`, `/api/system/*`,
`/api/actions/*` o `/api/security/*`, né creare pairing Console o Remote. NexusNXS
PC resta quindi esclusivamente nel tailnet. Abilitare con `npm run funnel` e
controllare con `npm run funnel:status`.

L'endpoint `/healthz` restituisce soltanto uno stato minimale e non divulga hardware, modelli, utenti o configurazione interna.

## Associazione e revoca

Il codice a sei cifre è monouso e scade dopo cinque minuti. Il dispositivo riceve una credenziale casuale; NexusNXS salva soltanto il relativo hash SHA-256. È possibile revocare immediatamente ogni dispositivo dalle impostazioni.

## Funzioni disponibili

- consultazione e ripresa delle conversazioni salvate;
- avvio di una nuova conversazione;
- invio di messaggi in modalità rapida o profonda;
- esecuzione del modello sulla workstation;
- pairing, elenco e revoca dei dispositivi.

Il client remoto non pubblica direttamente Ollama, SQLite, filesystem o IPC Electron. Il controllo remoto del desktop, il microfono remoto e la voce sintetizzata nel browser non fanno parte di questa sessione chat.

## App Android personale

`NexusNXS Remote` racchiude il client HTTPS in un contenitore Android nativo limitato al dominio Tailscale della workstation. Dopo la prima associazione conserva nel proprio spazio privato il token, la bozza e l'ultima conversazione; una chiusura, un riavvio o un cambio rete non richiedono quindi un nuovo QR. Se Android interrompe il processo, la pagina viene ricostruita dallo stato persistente. In assenza di rete compare un pannello essenziale con riconnessione automatica e accesso diretto a Tailscale.

L'APK si genera con `npm run android:remote`. Nessuna credenziale viene inserita nel pacchetto: cancellare i dati dell'app, revocare il telefono o ruotare le credenziali richiede correttamente una nuova associazione.

## NexusNXS Console

`NexusNXS Console` è il client operativo separato dalla chat. Riceve una richiesta
in linguaggio naturale, la trasforma in una proposta confinata alla cartella di
lavoro attiva e mostra l'anteprima prima dell'esecuzione. Anche con accesso
completo configurato sul PC, dal telefono ogni operazione richiede il gesto
esplicito **Autorizza**; il token è revocabile e una proposta scade ed è monouso.
Le azioni in corso hanno un identificatore associato al dispositivo. Il client
deve annullare la propria richiesta HTTP e chiamare `POST /api/actions/cancel`
quando la persona preme **Annulla** o chiude la sessione operativa. Il gateway
interrompe i processi posseduti, ma non dichiara annullate modifiche filesystem
già committate né azioni di alimentazione già pianificate.

L'APK Android si genera con `npm run android:console`. Su iPhone e iPad la stessa
superficie si apre da Safari all'indirizzo HTTPS Tailscale con suffisso
`/console` e può essere aggiunta alla schermata Home. Questa architettura evita
di pubblicare una shell, PowerShell o SSH: i comandi passano dal validatore e
dalla politica di consenso di NexusNXS, senza operatori shell impliciti.

## Dati e sicurezza

Le credenziali dei dispositivi associati vengono conservate esclusivamente
come hash. I client le ruotano automaticamente ogni 24 ore; il gateway accetta
il token precedente per non più di dieci minuti, così un cambio rete o una
richiesta già in volo non interrompe la sessione. La revoca del dispositivo
annulla immediatamente sia la credenziale corrente sia quella transitoria.

La configurazione risiede in `remote-access.json` nei dati locali di NexusNXS con permessi utente. Il gateway limita dimensione delle richieste e tentativi di pairing, usa token a 256 bit e applica header browser restrittivi.
