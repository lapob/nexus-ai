# Aggiornamenti e firma di NEXUSNXS

NEXUSNXS è predisposto per una distribuzione firmata, ma l'aggiornamento remoto
non deve essere attivato finché non sono disponibili:

1. un certificato Windows Authenticode custodito fuori dal repository;
2. un endpoint HTTPS controllato che ospiti manifest e pacchetti;
3. canali distinti `preview`, `beta` e `stable`;
4. una pipeline che firmi installer e manifest senza esporre credenziali;
5. test di installazione pulita, aggiornamento e rollback.

La distinta v2 include inoltre una policy verificata: `Stable` parte dal 10%
di rollout, `Beta` usa un anello separato e `Preview` resta manuale. Il recupero
è sempre una nuova release firmata con versione superiore (`signed-forward-fix`),
mentre snapshot versionati proteggono i dati locali. Non viene eseguito un
downgrade silenzioso di binari o schema dati.

Il client applica realmente `initialPercentage` con una coorte deterministica
locale. La coorte non usa identificatori hardware e non viene trasmessa al
server. Se l'identità locale non è disponibile, un rollout parziale fallisce in
modo chiuso. `updatePolicy.paused: true` arresta inoltre nuove installazioni di
una release già pubblicata, senza disinstallare o degradare versioni esistenti.

## Confine di sicurezza

- Il renderer non scarica né installa aggiornamenti.
- Solo il processo principale potrà interrogare il provider configurato.
- Manifest e pacchetti dovranno essere verificati prima dell'installazione.
- Nessun URL o segreto di pubblicazione deve essere hardcoded nel renderer.
- Gli aggiornamenti automatici non devono modificare vault o dati utente.

## Flusso implementato

Le build installate usano `electron-updater` con il target NSIS. Il processo
principale controlla il canale ogni sei ore, scarica in background e informa il
renderer soltanto quando il pacchetto è pronto. L'utente può riavviare subito o
continuare a lavorare; in quest'ultimo caso l'aggiornamento viene applicato alla
chiusura naturale. Le build di sviluppo e quelle senza `updatesUrl` non
contattano alcun servizio.

Prima di distribuire una versione:

1. configurare `updatesUrl` in `config/public-client.release.json` con una
   directory HTTPS dedicata, ad esempio `https://updates.example.com/stable`;
2. produrre l'installer con `npm run build:win:signed`;
3. eseguire `npm run verify:installer`;
4. pubblicare insieme `latest.yml`, installer e blockmap generati dalla stessa
   build, senza rinominarli;
5. provare prima un rollout `beta`, quindi impostare `stagingPercentage` nel
   manifest stable per una distribuzione graduale;
6. per ritirare una release difettosa pubblicare una versione superiore che
   corregga il problema: non riutilizzare mai lo stesso numero di versione.

Il certificato Authenticode e le credenziali di pubblicazione restano esterni
alla repository. `NEXUS_DISABLE_UPDATES=1` disabilita il controllo in emergenza
senza modificare l'installer.

Le build pubbliche accettano `NEXUS_RELEASE_CHANNEL=preview|beta|stable`.
`Preview` è una distribuzione manuale senza aggiornamento automatico; `Beta` e
`Stable` richiedono installer firmati, distinta Ed25519, feed HTTPS e chiave
pubblica incorporata. La pipeline produce inoltre una SBOM CycloneDX e verifica
offline SHA-256 degli artefatti e SHA-512 di `latest.yml` prima di dichiarare il
bundle pronto. Prima di interrogare Electron, il client confronta anche il
`latest.yml` remoto con dimensione e SHA-256 presenti nella distinta firmata;
il relativo SHA-512 lega quindi l'installer allo stesso feed fiduciario. Valori
diversi interrompono la preparazione. Prima di ogni apertura dati viene creato
automaticamente uno snapshot per versione con manifest SHA-256. Il manifest
viene verificato immediatamente e uno snapshot alterato non viene riutilizzato.

Le chiavi della distinta sono fornite soltanto dalla CI o dalla shell di
release tramite `NEXUS_RELEASE_MANIFEST_PRIVATE_KEY`,
`NEXUS_RELEASE_MANIFEST_PUBLIC_KEY` e `NEXUS_RELEASE_MANIFEST_KEY_ID`. La chiave
privata non viene mai copiata nell'app; il client contiene esclusivamente la
chiave pubblica necessaria al preflight del feed.

Gli arresti anomali dei processi Electron vengono registrati soltanto in locale
come codice anonimo, categoria, motivo tecnico breve e codice di uscita. Non
sono inclusi prompt, risposte, percorsi o stack completi. La raccolta locale può
essere disattivata con `NEXUS_LOCAL_CRASH_REPORTS=0`; non è previsto alcun invio
remoto finché non esiste un consenso esplicito nell'interfaccia.
