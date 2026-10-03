### Novita 0.3.24

- Control risponde senza attendere i probe dei programmi Windows; osservazioni condivise, refresh asincrono e protezione contro risultati precedenti a un'azione.
- Artefatti aperti esplicitamente, con download di risultato, originale e diff; icone accessibili, focus recuperato e hitbox separate.
- Attivita compatta con fasi reali espandibili, movimento ridotto rispettato.
- Android 6.5.22: sfondo sottostante oscurato, blur quando supportato, fondo sfumato e Core leggibile; due icone per testo e allegati nella stessa conversazione.
- Sorgenti predisposti per Node 24 e Codex Cloud, senza modelli, knowledge privata o credenziali del server. Il sito usa il branch separato `website`.
- Compilazione: downloader Electron aggiornato senza la catena HTTP cache vulnerabile; 49 dipendenze rimosse, audit runtime e tooling senza vulnerabilita note. Verificati download sintetico e rifiuto del checksum errato.

### Prove e limiti

Windows: 1021 test PASS, 2 SKIP dopo la correzione del downloader. La precedente
suite Linux locale: 1001 PASS, 17 SKIP; nessun FAIL. I controlli su checkout
puliti GitHub Windows/Ubuntu completano la verifica dei sorgenti.
Installer e smoke del pacchetto PASS. Download Electron dei contenuti esatti,
hitbox e recupero del focus verificati a scala 100% e 200%. Android: build,
lint e firma Preview verificati. La nuova prova fisica e stata rinviata dal
proprietario; non attribuire alla nuova build le prove delle versioni precedenti.

Questa e una build sperimentale pubblicata per revisione tecnica, non una
Beta approvata per inviti commerciali o una Stable. Mancano ancora firme di
produzione, prove vocali umane/eco, audit completo e criteri operativi per
utenti paganti. Nessun modello addestrato o promosso. Cloud inference disattivata.
La pubblicazione dei sorgenti del sito non equivale al deploy, ancora bloccato
dal gate delle dipendenze. Conservare il rollback prima di installare.
