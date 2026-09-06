# Verifica visiva del 6 settembre 2026

La revisione conserva il sistema visivo scuro e ciano già condiviso dalle app.
Non introduce nuove funzioni o controlli decorativi.

## Modifiche

- Desktop: metadati delle conversazioni e placeholder più leggibili; azioni dei
  messaggi più grandi e visibili sui dispositivi touch; interlinea di lettura
  aumentata e celle delle tabelle più chiare.
- Android pubblico: suggerimenti dei comandi e intestazioni più leggibili;
  descrizioni dei comandi su più righe, anche nella modalità assistente.
- Android Control: intestazioni a 12 sp e contrasto allineato al colore Mist.
- Web AI: metadati dei turni e didascalie delle immagini a 12 px equivalenti,
  con il colore secondario condiviso dalle app.
- Sito: introduzione concreta, intervalli decorativi più brevi, conversazione
  dimostrativa catturata dall'app e messaggio offline riferito alla rete locale.
- QA desktop: la risposta dimostrativa viene montata nello stesso contenitore
  dell'app reale, così i selettori di attenuazione dello sfondo sono verificati.

## Verifiche

- 828 test applicativi superati; controllo sorgenti e build completati.
- `verify:experience`: AI, voce, Electron, chiusura e 250 cicli di soak superati.
- Conversazione, cronologia, impostazioni, comando e risposta catturati al
  100% e al 200%; controlli di accessibilità su sei superfici superati.
- Web AI: layout verificato su undici viewport, inclusi schermi stretti e
  orientamento orizzontale.
- APK Android pubblico e Control compilati con lint; installer Windows
  ricostruito e avvio del pacchetto verificato.
- Sito: 32 test server e 23 scenari browser verificati, dopo l'aggiornamento
  delle aspettative sui testi e sulle immagini deliberatamente cambiati.

## Limiti

Nessun telefono era collegato: le matrici fisiche Android sono state saltate.
Le precedenti catture Android sono riferimenti, non prove delle nuove build.
I pacchetti restano Preview; questa revisione non attesta firma commerciale,
distribuzione Play Store o completamento dei requisiti Stable.
