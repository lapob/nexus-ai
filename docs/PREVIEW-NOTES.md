### Novita 0.3.26

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
