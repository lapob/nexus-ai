# Storage portatile e dati

## Stato supportato

NexusNXS mantiene sul volume del progetto sorgenti, dati applicativi, chat,
impostazioni, knowledge, indici, modelli e runtime AI vendorizzato. Il launcher
inoltra inoltre `TEMP` e `TMP` dei soli processi NexusNXS a
`.nexus-data/tmp`; non modifica le variabili globali di Windows.

`npm run storage:audit` produce un inventario in sola lettura. Non cancella,
sposta o stampa credenziali.

## Ambiente developer indipendente dalla lettera

Gli script non assumono `Z:`. Derivano repository, workspace e radice del
volume dalla propria posizione a ogni avvio. Le build Android rigenerano il
`local.properties` ignorato da Git con l'SDK effettivamente rilevato; Ollama
preferisce la libreria `.ollama` sullo stesso volume del repository e usa il
runtime vendorizzato prima di un'installazione globale.

L'ordine di risoluzione delle toolchain è:

1. override Nexus esplicito (`NEXUS_ANDROID_SDK`, `NEXUS_GRADLE_USER_HOME`,
   `NEXUS_JAVA_HOME`, `NEXUS_OLLAMA_MODELS`);
2. `.toolchains` accanto al workspace;
3. `[DEVELOPMENT]` sulla radice del volume corrente;
4. variabili standard della toolchain;
5. installazione standard del profilo Windows, solo come fallback.

`NEXUS_DEVELOPER_HOME` e `NEXUS_TOOLCHAINS_HOME` accettano anche percorsi
relativi al workspace. I task Core e Presence memorizzano l'identità del volume
e il percorso relativo, non la lettera assegnata da Windows. Su un nuovo PC il
task non esiste ancora: basta aprire PowerShell nella `.AI` e rieseguire una
volta `npm run server:install`.

Questa policy riguarda soltanto sviluppo, modelli privati e build locali. Il
setup pubblico continua a usare le directory standard dell'applicazione e del
profilo utente; non cerca toolchain, knowledge privata o modelli sul disco del
cliente.

## Cosa resta nel sistema operativo

Tailscale e Cloudflared sono servizi Windows: binari, driver, stato protetto,
registro, task, Event Log e parte delle credenziali restano sul volume di
sistema. Anche Android SDK, Gradle, JDK, Node e PowerShell possono restare
toolchain di sistema senza contenere la knowledge NexusNXS.

Spostare questi componenti su un disco rimovibile non crea una macchina
"senza tracce" e rende fragile l'avvio quando il disco manca. La protezione
corretta e cifrare sia il volume portatile sia il volume di sistema, limitare i
segreti, applicare ACL e fermare ordinatamente i servizi prima di scollegare il
disco.

## Architettura dei dati

La knowledge non viene incorporata in un singolo file o nel codice. I confini
sono separati:

1. fonti autorevoli versionate (Markdown, documenti e metadati);
2. blob e modelli immutabili identificati da hash;
3. cataloghi di provenienza e versioni;
4. indici SQLite, full-text e vettoriali rigenerabili;
5. artefatti di release con distinta e digest;
6. cache e risultati QA con retention;
7. segreti fuori dal repository, protetti dal sistema operativo.

Il disco portatile non deve essere l'unica copia: va affiancato da un backup
cifrato e disconnesso, verificato periodicamente tramite restore di prova.

## Migrazione controllata

Le dipendenze ancora nel sistema vanno migrate una alla volta: copia,
configurazione esplicita, riavvio, verifica di salute, quindi eventuale
disinstallazione della copia precedente. Non si eliminano directory globali o
cache condivise finche tutti i consumatori non sono stati censiti.
