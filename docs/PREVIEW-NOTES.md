### Prossimo aggiornamento — sorgenti verificati, build pubblica da completare

- Windows: Electron43.8.3, con controllo di coerenza fra versione richiesta, lock e runtime impacchettato; argomenti alternativi del builder rifiutati. Corrette le dipendenze compatibili fast-uri e Undici segnalate dagli audit.
- Server: avanzamento esplicito durante verifiche e caricamento del modello; recupero del collegamento desktop privato gia abilitato dopo un aggiornamento, soltanto nella sessione interattiva del proprietario, senza aprire il pet. Il pannello di monitoraggio resta separato dal servizio.
- Control1.20.3, solo proprietario: selettori e comando inferiore conservati nei cambi cartella, transizione dopo il layout, righe delle applicazioni uniformi senza allineamento delle baseline multilinea. Il testo lungo conserva la descrizione accessibile completa.
- Web: Core centrato anche con testo ingrandito, recupero della voce e microfono acquisito soltanto quando il servizio risulta disponibile. Ricerca naturale con termini ripuliti dalle sole richieste finali di formattazione; risultati vuoti distinti dal guasto del provider.
- Preview manuale: firme commerciali, voce umana/eco, latenza vocale, iOS e requisiti Stable restano aperti. Android pubblico6.5.25 e modello locale invariati; nessun training o cloud inference attivato.

### Novita 0.3.33

- Web app: icone Material Symbols condivise con Android, incorporate offline con licenza; impostazioni raggruppate in sezioni coerenti, picker leggibili e animazione rispettosa del movimento ridotto. Lo stato inattivo non riserva piu uno spazio vuoto fra impostazioni e download.
- Control 1.20.1 (solo proprietario): il cambio Applicazioni/Giochi aggiorna solo il pannello, mantenendo ferma la navigazione. Azioni server adattive con altezza naturale; blur inferiore raccordato su 32 dp e shader riutilizzati.
- Collaudo: cinque profili Control sul Samsung, posizione identica della scheda App fra tre cambi cartella, apertura/annullamento della conferma arresto senza esecuzione; cinque profili impostazioni web e quattro scenari offline. Le prove non certificano tutti i dispositivi.
- Android pubblico resta 6.5.25. Preview manuale, firme commerciali e collaudo vocale umano ancora aperti; modello locale e gate di qualita invariati.
### Novita 0.3.32

- Android 6.5.25: icone Material Symbols arrotondate e incluse offline, Inter in tutti i ruoli tipografici, impostazioni con transizioni direzionali e gesto Indietro predittivo. Annullare il gesto conserva la pagina. Area copia codice da 48 dp.
- NexusNXS Control 1.20.0 (solo proprietario): icone coerenti per browser, note, terminale, giochi, servizi e alimentazione; cartelle animate conservate. Scheda selezionata centrata e bordi laterali sfumati nativi, senza blur calcolato ad ogni fotogramma.
- Entrambe le app compilate con lint e shrinking; cinque profili di schermo per app su un Samsung, 24 test SQLite/Keystore/continuita e verifiche gesture/IME. Sono prove sul Samsung disponibile, non una certificazione di tutti i dispositivi.
- Il servizio locale usa il runtime verificato Ollama 0.40.9 con cloud disattivato; ricerca di release con fonte ufficiale e recupero del catalogo Windows senza spostare i pesi. Il modello resta la baseline 14B: 88/100 nella suite interna, gate qualita non superato.
- Preview con aggiornamenti manuali: Windows senza certificato editore, Android con firma di collaudo. Voce umana, riduzione della latenza STT, ricerca prima del login e requisiti Stable/commerciali restano distinti. Nessuna installazione Windows eseguita da questo aggiornamento.

### Novita 0.3.31

- Desktop: descrizioni, note e categoria selezionata nelle impostazioni piu leggibili, usando il colore secondario condiviso e lo stesso font.
- QA: misurazione del movimento effettivo del Core e rifiuto delle metriche incomplete; pulizia dei profili di prova resistente al rilascio tardivo dei processi Chromium.
- Restano le funzioni della0.3.30. Nessuna modifica ad Android6.5.24/code114 o Control42, nessun aggiornamento del runtime server. Preview non firmata, installazione manuale; prove vocali umane e requisiti commerciali ancora distinti.

### Novita 0.3.30

- Desktop: memoria personale con provenienza, ultimo utilizzo, scadenza modificabile ed esportazione JSON esplicita non cifrata. Esportazione limitata con conteggio visibile; nessuna sincronizzazione automatica.
- Artefatti desktop: originale AI conservato, ultime sei copie modificabili e versionate, copia/download della versione scelta e rifiuto dei salvataggi in conflitto. Le modifiche non scrivono nei file del progetto.
- Ricetta locale "Copia e consulta": documenti fino a 2 MiB, copia senza sovrascrittura, approvazione separata per ogni passo, ricevute e recupero del checkpoint. Disponibile quando il client ha un workspace locale autorizzato.
- Nei sorgenti server: ammissione runtime strict per richieste pubbliche, proprietà del processo e blocco dopo perdita dell'ammissione. La Preview client non aggiorna il servizio server e non risolve i finding delle dipendenze del runtime.
- Restano distinti il collaudo vocale umano, le firme e gli aggiornamenti automatici di produzione, la parità delle nuove funzioni con web/Android e i requisiti commerciali. Android 6.5.24/code114 e Control42 non cambiano in questa Preview.

### Novita 0.3.29

- Cronologia web senza account nel browser, recuperata dopo il ricaricamento; cancellazione coordinata fra schede e protezione contro risposte, allegati e scritture tardive. Se il salvataggio e negato, la memoria temporanea e indicata chiaramente.
- Il ledger pubblico conserva su disco soltanto metadati opachi; replay delle risposte in RAM con scadenza breve. Il reset autenticato annulla e cancella soltanto le richieste della propria installazione.
- Conversazione rispettosa anche in caso di frustrazione, senza simulare sofferenza o impedire cancellazione e stop. Questo non certifica emozioni o qualita del modello.
- Il controllo di disponibilita mostra gli errori HTTP effettivi e distingue lo stato attuale dalla copertura SLO ancora insufficiente. Con il solo server locale, a PC spento il servizio resta indisponibile.
- Allegati originali, immagini e bozze non inviate non vengono salvati nella cronologia web. Per cancellare IndexedDB dal browser occorre rimuovere i dati del sito; la sola cronologia di navigazione non basta. Limiti e conservazione sono descritti in `docs/LOCAL-DATA.md`.

### Novita 0.3.28

- Letture immagini e feed con limiti di byte e tempo prima dell'allocazione, cancellazione condivisa e originali preservati.
- Android 6.5.24/code114: import e backup su worker isolati, anteprime campionate fuori UI. APK invariata nella29; public114 e Control42 hanno superato cinque profili fisici Online il10ottobre.
- Audit Codex Security del6ottobre: report parziale50/930file,880percorsi residui. Non e un audit totale.

### Novita 0.3.27

- Avvio Windows: un timeout DPAPI viene ritentato una sola volta entro un limite di tempo; errori crittografici restano negati, senza conservare credenziali in chiaro.
- Un errore di bootstrap restituisce un codice non zero dopo la pulizia, permettendo al supervisore Windows di recuperare il servizio.
- Suite Windows aggiornata: 1033 PASS, 2 SKIP, nessun FAIL; verificato anche il codice di uscita su Electron reale.

### Miglioramenti inclusi dalla 0.3.26

- Control usa un solo contratto di azioni: la chiusura di un programma consentito conserva verifica dello stato, permessi e ricevuta.
- Android 6.5.23 protegge l'assistente di sistema e ignora richiami ASSIST non autorizzati sul launcher pubblico.
- Stop rilascia anche un microfono concesso in ritardo; una precedente richiesta non sostituisce una nuova sessione.
- Le misure di disponibilita vengono ricostruite dai campioni grezzi: intervalli senza osservazioni e duplicati non possono certificare la copertura.

### Miglioramenti inclusi dalla 0.3.25

- Download della web app derivati dalla stessa versione/tag del publisher; eliminato il riferimento obsoleto alla 0.3.23 trovato nel controllo live.
- Le release gia pubblicate restano immutabili: un retry verifica gli hash, una sostituzione richiede una nuova versione.

### Miglioramenti inclusi dalla 0.3.24

- Control risponde senza attendere i probe dei programmi Windows; osservazioni condivise, refresh asincrono e protezione contro risultati precedenti a un'azione.
- Artefatti aperti esplicitamente, con download di risultato, originale e diff; icone accessibili, focus recuperato e hitbox separate.
- Attivita compatta con fasi reali espandibili, movimento ridotto rispettato.
- Android 6.5.22: sfondo sottostante oscurato, blur quando supportato, fondo sfumato e Core leggibile; due icone per testo e allegati nella stessa conversazione.
- Sorgenti predisposti per Node 24 e Codex Cloud, senza modelli, knowledge privata o credenziali del server. Il sito usa il branch separato `website`.
- Compilazione: downloader Electron aggiornato senza la catena HTTP cache vulnerabile; 49 dipendenze rimosse, audit runtime e tooling senza vulnerabilita note. Verificati download sintetico e rifiuto del checksum errato.

### Prove e limiti

I controlli su checkout puliti GitHub Windows/Ubuntu verificano i sorgenti;
il checkpoint pubblico registra revisione e risultato effettivi di ciascuna consegna.
Installer e smoke del pacchetto PASS. Download Electron dei contenuti esatti,
hitbox e recupero del focus verificati a scala 100% e 200%. Android 6.5.23:
build, lint, firma Preview, cinque profili fisici Online e 24 test nativi PASS.
Il richiamo dal tasto assistente di sistema e la voce umana restano prove distinte.
Audit Codex Security esplicitamente parziale: 65 file revisionati su 929;
la protezione dell'assistente corregge il finding medio individuato sul sorgente
precedente, senza certificare il restante codice.

Questa e una build sperimentale pubblicata per revisione tecnica, non una
Beta approvata per inviti commerciali o una Stable. Mancano ancora firme di
produzione, prove vocali umane/eco, audit completo e criteri operativi per
utenti paganti. Nessun modello addestrato o promosso. Cloud inference disattivata.
La pubblicazione dei sorgenti del sito non equivale al deploy, ancora bloccato
dal gate delle dipendenze. Conservare il rollback prima di installare.
