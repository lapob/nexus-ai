# Organizzazione e manutenzione del workspace

La cartella NexusNXS contiene due repository distinti dello stesso prodotto: `.AI` per applicazioni, backend e client Android; `.SITE` per il sito pubblico. Non inizializzare un terzo repository nella radice.

| Cartella | Contenuto | Regola |
| --- | --- | --- |
| `.AI`, `.SITE` | Sorgenti, test, configurazione pubblicabile | Versionare nei rispettivi repository |
| `.nexus-data` | Conversazioni, memoria, stato e segreti locali | Backup cifrato, mai Git |
| `.knowledge-public` | Knowledge distribuibile | Passare i gate di pubblicazione |
| `.knowledge-private` | Documenti personali | Mai pubblicare |
| `.ollama` | Modelli | Conservare un'unica libreria |
| `.toolchains` | SDK, Java, Gradle, browser e Docker | Ricostruibile, conservare licenze |
| `.services`, `.docker-data`, `.docker-config` | Servizi e persistenza | Non trattare come cache |
| `qa-artifacts` | Rapporti e prove locali | Non esporre sul sito |

Gli alias `NexusNXS-Models` e `NexusNXS-Runtime` alla radice del volume sono junction verso questa cartella. Evitano incompatibilità del loader GPU con alcuni caratteri nei percorsi e non duplicano i file. `npm run storage:audit` mostra la collocazione effettiva e controlla i target degli alias presenti. Le dipendenze Windows installate come servizi restano nelle loro posizioni di sistema.

Java viene cercato prima in `.toolchains/jdk`, salvo override esplicito `NEXUS_JAVA_HOME`. Conservare l'installazione originale se serve anche ad Android Studio. Quando si aggiorna la copia portatile, verificare provenienza, integrità e compilazione dei due client; non copiare singole DLL fra versioni diverse.

## Comandi dalla radice NexusNXS

```powershell
npm --prefix .AI run storage:audit
npm --prefix .AI run check
npm --prefix .AI test
npm --prefix .AI run verify:experience
npm --prefix .SITE run verify:release
powershell -NoProfile -File .AI/scripts/cleanup-workstation.ps1
powershell -NoProfile -File .AI/scripts/cleanup-workstation.ps1 -Apply
```

La pulizia senza `-Apply` inventaria soltanto. La lista è chiusa: archivi scaricabili del candidato runtime e output di compilazione Android; APK di rilascio, modelli, database, screenshot e log sono esclusi. Il report `.AI/qa-artifacts/cleanup-latest.json` distingue byte candidati e byte rimossi, verificando che ogni rimozione sia riuscita. Le build successive ricreano i propri output: lo spazio rimosso non è una misura del risparmio netto permanente.

La pulizia rifiuta junction e link negli antenati o nell'albero candidato, si ferma sugli errori e controlla Gradle/Kotlin prima di rimuovere output Android. Eseguirla a compilazioni terminate; non fare pulizie contemporanee a installazioni o modifiche delle stesse directory. I vecchi flag per cache di sistema, cestino e residui esterni sono rimossi intenzionalmente.

Spostare il workspace non sposta automaticamente attività pianificate, registrazioni Windows o credenziali protette dall'account. Dopo un cambio di percorso verificare autostart, Docker, alias, ricerca, health/readiness pubbliche e compilazioni. Non distribuire una copia della cartella privata come installer.

## Pulizia verificata dell'8 settembre 2026

Rimossi 46 composable privati della vecchia superficie Android, irraggiungibili
dall'entry point `NexusInstantApp`, e la regola CSS duplicata del composer web.
I contratti statici ora verificano la superficie effettiva: invio e IME,
streaming, stato della connessione e autorizzazione Work. I controlli su
cifratura, consenso, ticket, persistenza e trasporto sono conservati.

Rimossi 19 profili Electron di prova non in uso (303.916.147 byte) e output
Android ricostruibili (78.137.878 byte), dopo l'arresto ordinario del daemon
Gradle. Totale rimosso: 382.054.025 byte. Screenshot, report, dati e APK sono
conservati; Android 6.4.10 resta disponibile per il ripristino della Preview.
I due runner Presence eliminano ora soltanto il profilo creato dalla propria
esecuzione, dopo la chiusura dei processi. La pulizia rifiuta link e junction.

Verificati 850 test, check completo, build/lint Android, menu Presence e
avvio/riapertura ASAR. `verify:experience` superato: AI, voce, Electron,
chiusura e 250 cicli senza richieste orfane. Le prove fisiche Android restano
distinte dalla compilazione e dalla verifica dell'asset nel browser.
