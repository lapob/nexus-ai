# Verifica NexusNXS — 7 settembre 2026

## Modifiche applicate

- Web AI: disponibilità basata su `/readyz`, distinzione tra preparazione e assenza di connessione. Richiesta conservata se il servizio non è pronto o fallisce prima di produrre testo.
- Avvio server: dopo i tentativi iniziali, recupero ogni 60 secondi per errori temporanei; gli errori permanenti non vengono ritentati indefinitamente.
- Offline sul dispositivo: shell e Core abituali disponibili dopo la prima visita online; invio e voce disabilitati, bozza mantenuta durante la riconnessione.
- Offline sul server: il Worker usa una copia generata della stessa shell pubblica, con nonce CSP per risposta. Nessun messaggio o dato di sessione entra nella copia.
- Sito: schermata reale del PC con Core desktop originale, senza sovrapposizione del Core Android; sollevamento della cornice al passaggio del puntatore. I Core desktop restano intenzionalmente distinti.
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

## Qualità AI e uso proprietario

- Corretto un falso positivo nei documenti: ruoli didattici e narrativi come “act as a tutor” non interrompono più la risposta. Restano rilevati impersonazione privilegiata, override, esfiltrazione e istruzioni nascoste.
- Il laboratorio distingue casi deterministici, inferenze del modello, successo al primo tentativo, revisioni e latenza delle sole inferenze. Il punteggio dopo revisione non deve essere presentato come capacità grezza del modello.
- La quota giornaliera del gateway riguarda le sessioni pubbliche. La chat desktop proprietaria non passa attraverso quel contatore. Il profilo pubblico `developer` è già senza quota giornaliera ma richiede un binding HMAC lato server; questo intervento non assegna privilegi a visitatori anonimi.
- “Senza limiti artificiali” non significa contesto infinito o assenza di timeout: restano capacità hardware, cancellazione, autenticazione e consenso operativo.
- Verifica corrente: `intelligence-tests.log` 834/834; `intelligence-security.log` 132/132; `intelligence-check.log` build e controlli superati; `intelligence-experience.log` AI 8b 17/18 e 14b 18/18, voce, Electron, chiusura e 250 cicli senza richieste orfane.
- Suite sintetica estesa 1.3.0 sul 14b: 39/40, nessun caso obbligatorio fallito; 9 casi deterministici e 31 inferenze, 93,55% corrette al primo tentativo, 2 revisioni. `it-vincolo-04` rispetta le sei parole ma non contiene il termine tematico richiesto dallo scorer. Questi risultati non certificano capacità generali o assenza di errori.
