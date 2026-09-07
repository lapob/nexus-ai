# Verifica NexusNXS — 7 settembre 2026

## Modifiche applicate

- Web AI: disponibilità basata su `/readyz`, distinzione tra preparazione e assenza di connessione. Richiesta conservata se il servizio non è pronto o fallisce prima di produrre testo.
- Avvio server: dopo i tentativi iniziali, recupero ogni 60 secondi per errori temporanei; gli errori permanenti non vengono ritentati indefinitamente.
- Offline sul dispositivo: shell e Core abituali disponibili dopo la prima visita online; invio e voce disabilitati, bozza mantenuta durante la riconnessione.
- Offline sul server: il Worker usa una copia generata della stessa shell pubblica, con nonce CSP per risposta. Nessun messaggio o dato di sessione entra nella copia.
- Sito: schermata principale del PC con anteprima animata del Core condiviso con Android, nella home e nella pagina desktop. Etichetta esplicita di anteprima animata.
- QA streaming: stabilità del dock misurata dopo l'effettivo inizio della transizione, includendo il tempo variabile della verifica readiness.

## Evidenze locali

- `qa-artifacts/offline-experience.log`: gate AI, voce, Electron, chiusura e 250 cicli; nessuna richiesta orfana.
- `qa-artifacts/offline-final-contracts.log`: gateway, warm-up, readiness UI, aggiornamenti e backup.
- `qa-artifacts/offline-web-experience.log`: risposta desktop di 4463 caratteri, due turni, Stop mobile con testo parziale conservato, dock stabile.
- `qa-artifacts/offline-browser-final.log`: ricaricamento offline, stessa shell, azioni AI disabilitate, bozza e ripristino dell'invio alla riconnessione.
- `qa-artifacts/readiness-layout.log`: 11 viewport, collisioni e geometria dei controlli.
- `qa-artifacts/readiness-backup.log`: ripristino cifrato di quattro file sintetici.
- `qa-artifacts/readiness-brand.log`: asset del marchio coerenti.
- Sito: prova del fallback Worker con upstream 502 e screenshot mobile; shell normale, stato offline visibile, AI disabilitata.

## Limiti e lavoro residuo del programma complessivo

- ADB non rileva attualmente il dispositivo: le nuove prove reali di tastiera, rumore, Bluetooth e interruzione voce non sono certificate da questo passaggio.
- Le conversazioni autenticate dispongono già di API di sincronizzazione/importazione e revoca. La web app pubblica mantiene la promessa di sessione temporanea; la nuova sincronizzazione pubblica facoltativa tra dispositivi non è stata implementata.
- Il controllo del marchio non equivale a una completa centralizzazione di tutti i token tipografici e dimensionali tra Kotlin, desktop e sito.
- Stable non pronta: mancano firme di produzione Windows/Android/manifest e origine aggiornamenti, oltre a evidenze di backup esterno, continuità elettrica e rete, rotazione chiavi, aggiornamento su Windows pulito, esercitazione incidenti e verifica indipendente di sicurezza.
- Il ripristino sintetico non prova un aggiornamento su un PC Windows pulito. Gli artefatti distribuiti restano Preview; questo intervento non introduce firme di produzione né una nuova release APK.
