# Installer Windows

NEXUSNXS usa `electron-builder` con target NSIS assistito. Il setup pubblico è un
client HTTPS leggero: non include Ollama, non scarica pesi e non sceglie modelli
in base al PC dell'utente.

## Componenti del setup

- applicazione Electron;
- provider NexusNXS Service, configurato con un'origine HTTPS durante la release;
- Whisper locale con il modello `small`, che è anche il modello preferito dal
  servizio vocale NEXUSNXS;
- Kokoro locale per la sintesi vocale;
- nessun peso LLM incorporato nel setup.

Il comando `npm run build:win` richiede `NEXUS_SERVICE_URL`, verifica che sia
HTTPS e genera `release/NexusNXS-0.3.8-Setup.exe` senza runtime LLM locale.

La disinstallazione rimuove l'applicazione ma conserva configurazione, dataset
approvati e preferenze locali. Un'eventuale funzione “rimuovi anche i miei dati”
dovrà richiedere un consenso separato ed esplicito.

## Isolamento

La versione installata conserva soltanto dati dell'app e conversazioni locali.
Ollama resta disponibile esclusivamente sulla workstation sviluppatore/server:

```text
npm run dev
npm run ai:provision
npm run ai:pull -- qwen3:14b
```

Non legge, modifica o disinstalla un'eventuale installazione Ollama personale.
La modalità di sviluppo usa l'istanza privata `11435`. `npm start` non dipende
da una lettera disco: rispetta prima `NEXUS_OLLAMA_MODELS` o `OLLAMA_MODELS`,
altrimenti cerca librerie valide nella home e nelle unità disponibili. Se non
ne esiste una, crea il layout standard nella home dell'utente.

## Primo avvio adattivo

Il client pubblico rileva esclusivamente le capacità necessarie a scegliere la
qualità grafica, il frame rate e le impostazioni vocali sostenibili dal
dispositivo. Non cerca, installa o scarica modelli LLM e non legge librerie
Ollama eventualmente presenti sul computer. Le richieste AI vengono inviate al
servizio HTTPS configurato nella release; se il servizio non è raggiungibile,
l'interfaccia mostra uno stato offline senza avviare provisioning locale.

Il provisioning Ollama documentato nella sezione precedente è riservato ai
comandi di sviluppo e alla workstation server e non viene eseguito dal setup
pubblico.

## Disinstallazione

`deleteAppDataOnUninstall` è disattivato: la disinstallazione rimuove i file
dell'applicazione ma conserva impostazioni, dataset approvati e dati locali.
Le vault esterne e qualsiasi Ollama installato separatamente non vengono
toccati. Una futura pulizia completa dovrà essere un'opzione distinta e
confermata esplicitamente dall'utente.

## Distribuzione pubblica

Il runtime incorporato viene verificato durante la build, ma l'installer NEXUSNXS
deve comunque essere firmato con un certificato editoriale prima della
distribuzione pubblica per evitare avvisi SmartScreen e garantire l'integrità
della release.
