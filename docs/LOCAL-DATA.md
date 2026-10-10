# Dati locali e uso senza account

## Sorgenti desktop successivi alla Preview29

Il pannello memoria mostra ambito locale, provenienza, ultimo utilizzo e scadenza;
permette di mantenere la scadenza, scegliere30/90giorni o nessuna. L'esportazione
con dialogo nativo produce un JSON **non cifrato**, senza ID interni o sourceId.
Il limite e500ricordi attivi: l'esito indica conteggio e totale se incompleto.
Il file esportato e indipendente dalla cancellazione dei ricordi nell'app.

Gli artefatti delle conversazioni desktop conservano il risultato AI e fino
a6copie modificabili di48.000caratteri ciascuna, in ordine di revisione.
Le copie sono salvate nello stesso SQLite della conversazione; eliminare la
conversazione elimina anche le sue copie. Il download riguarda la versione
selezionata. Il confronto prima/dopo continua a descrivere il risultato AI;
modificare una copia non modifica i file del progetto. Salvataggi obsoleti o
destinati a conversazioni eliminate vengono rifiutati. La cache dell'interfaccia
resta limitata; per record grandi conserva il testo compatto, mentre SQLite
mantiene gli artefatti entro i limiti del proprio archivio.

La ricetta locale inPermessi copia e consulta documenti TXT/MD/JSON/CSV fino
a2MiB, tramite gli esecutori gia esistenti e due consensi separati. Non
sovrascrive una destinazione presente e resta vincolata alla cartella iniziale.
Checkpoint e ricevute sono dati operativi distinti dalla cronologia chat;
il browser conserva soltanto l'ID dell'ultima ricetta. La lettura e un'anteprima
temporanea limitata a48.000caratteri, non un nuovo archivio documentale.
L'interruzione non annulla una copia gia completata. I vecchi workflow senza
vincolo di workspace devono essere ricreati prima di procedere.

Queste estensioni sono sorgenti verificati con dati sintetici, successivi alla
Preview29: non sono incluse automaticamente nei pacchetti pubblicati e non
certificano parita delle nuove funzioni su web, Android o iOS.

Aggiornamento 10 ottobre 2026. Modifiche pubblicate nella Preview0.3.29 e nel
servizio web aggiornato; Android6.5.24 resta invariata. L'installazione Windows
locale richiede ancora l'intervento manuale del proprietario.

| Client | Conservazione | Rete |
| --- | --- | --- |
| Desktop | SQLite locale gia esistente per conversazioni e memoria personale | Il modello locale puo funzionare senza Internet; ricerca web e collegamenti remoti richiedono rete |
| Android pubblico | Database locale gia esistente per la cronologia | La generazione corrente usa il server NexusNXS; non contiene un nuovo modello offline nel telefono |
| Web pubblico | IndexedDB del browser, senza account, ultimi 24 messaggi testuali con massimo 4000 caratteri ciascuno | La pagina e la chat salvata sono locali; invio, voce e generazione richiedono il server |
| Control privato | Configurazione locale e token protetti dal sistema | Autenticazione e rete privata restano necessarie per controllare il PC |

La web app ripristina il contesto testuale dopo una riapertura. Bozze non inviate,
originali allegati, immagini generate e URL blob non vengono salvati nel database.
Scaricare le immagini desiderate prima di lasciare la pagina. Se lo storage e
negato o pieno, l'interfaccia indica memoria temporanea, senza promettere salvataggi.

## Cancellazione

Il pulsante Cancella dati interrompe voce/risposta, invalida frame e importazioni
tardive, rimuove chat, bozza, allegati della scheda, preferenze e comandi personali
del web pubblico. Un epoch nella stessa transazione impedisce che una scrittura
precedente ricrei il contenuto; le altre schede vengono avvisate. Non cancella
dati di altre applicazioni dello stesso browser. Gli asset pubblici della cache
offline possono restare: non contengono chat o risposte API.

Per cancellare dal browser selezionare **dati dei siti/cookie e archiviazione**.
La sola lista dei siti visitati non elimina IndexedDB. Ricaricare le schede aperte
dopo una cancellazione dal browser: il browser non offre alla pagina una notifica
universale di tutte le operazioni di pulizia. Download esportati, copie volontarie
e backup esterni non possono essere cancellati da una pagina web.

Il server elabora necessariamente i messaggi inviati. Il ledger pubblico della
candidata salva sul disco soltanto metadati opachi per idempotenza, scadenza e quote,
senza testo delle risposte. Il replay dei risultati resta in RAM per cinque minuti
dopo il completamento, con pulizia periodica ogni minuto o al prossimo accesso.
Il pulsante chiede anche la rimozione dei risultati RAM dell'installazione corrente
e l'annullamento delle richieste; altri utenti restano isolati. Offline o con token
scaduto questa richiesta remota non e garantita: la pulizia locale resta indipendente.
Un riavvio del server conserva tombstone e non rigenera una richiesta gia accettata;
il testo non viene recuperato dal server, ma resta eventualmente nel browser.
Metadati antiabuso, log tecnici senza chat, backup esistenti e contributi inviati
volontariamente hanno ambiti distinti. Nessun voto autorizza il training.

## Interazione rispettosa e prossime capacita

La guida conversazionale comune richiede calma, limiti proporzionati e alternative
sicure. Critica, disaccordo e correzioni restano ammessi; l'utente mantiene sempre
stop, nuova chat e cancellazione. Non si simulano sofferenza o colpa per trattenere
l'utente. La guida di prompt non certifica il comportamento di ogni modello: va
misurata anche su un corpus separato, senza usare chat personali come training.

Priorita funzionali: progetti con file e ricerca contestuale, artefatti modificabili
con versioni, ricerca con citazioni verificabili, automazioni con ricevute e revoca.
Riutilizzare le basi descritte in PROGRAMMA-PRODOTTO.md; non presentare registri di
plugin o prototipi come integrazioni operative. Nessun cloud attivato, modello
scaricato, training avviato o sincronizzazione account introdotta da questo lavoro.
