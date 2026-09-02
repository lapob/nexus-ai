# NexusNXS Console

Client operativo separato da NexusNXS Remote AI. Usa la stessa associazione privata
Tailscale, mostra ogni proposta prima dell'esecuzione e richiede sempre
un'autorizzazione esplicita. Il logo e la grammatica motion sono condivisi con
NexusNXS Android; l'identità applicativa e la destinazione `/console` restano
separate. La dashboard usa un'unica vista operativa, senza modalità essenziale
o pannelli duplicati.

L'endpoint non è incluso nel repository. Per una build locale imposta
`NEXUS_CONSOLE_URL` su un'origine HTTPS autorizzata; gli indirizzi privati e le
credenziali devono restare nelle variabili d'ambiente o nelle proprietà Gradle
locali, mai nel controllo versione.

La grammatica di movimento proviene da `../shared-motion`: durate, curve e
profilo adattivo sono condivisi con NexusNXS Android e non vanno ridefiniti
dentro le singole Activity.

## Supremo e richieste UAC

Il comando Supremo tenta prima di riusare una finestra visibile. Per poter
interagire anche con le richieste UAC, il PC deve registrare una sola volta i
broker statici tramite `npm run supremo:install-control` da PowerShell avviata
come amministratore. Il broker apre esclusivamente il binario firmato da
Nanosystems presente in Program Files e chiude esclusivamente `Supremo.exe`:
non accetta percorsi, argomenti o comandi provenienti dal telefono. In assenza
del broker l'app usa l'avvio standard e indica chiaramente `UAC limitato`.
