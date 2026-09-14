# Android 6.5.14 — verifica del flusso

Preview verificata sul Samsung SM_S931B. Questo rapporto non certifica tutti
 i dispositivi e non sostituisce i gate di distribuzione Stable.

## Modifica

Ricerca nelle impostazioni per parole del titolo e descrizione delle quattro
categorie esistenti. Riutilizza CompactSetting e SettingsGroup; nessun nuovo
permesso. Stato vuoto, cancellazione e apertura della categoria con IME chiusa.

## Prove reali

- File TXT sintetico selezionato dal provider Documenti e inviato a Nexus.
- Codice presente soltanto nel file restituito correttamente: ORBIT-742.
- Dopo arresto e riapertura dell'app, conversazione presente in cronologia;
  selezionandola viene ripristinata la risposta.
- Ricerca backup: unica categoria Privacy e dati.
- Ricerca backupzzz: nessuna impostazione trovata.
- Cancella ricerca e riprova backup: apertura della categoria riuscita;
  dumpsys input_method conferma mInputShown=false.
- Screenshot della sezione risultante ispezionato senza sovrapposizioni.

Le acquisizioni XML e PNG sono in qa-artifacts/android-upload-* e android614-*.
Sono artefatti locali di verifica, non immagini promozionali. Durante alcune
prove il telefono ruotava: le azioni con coordinate obsolete sono state scartate
 e ripetute con orientamento fissato. Rotazione automatica poi ripristinata.

## Limiti

Provato TXT; non ancora upload completo di PDF, foto, file grandi o timeout di
rete. Nessuna equivalenza full-duplex acustica dimostrata. La matrice5profili
Android della6.5.13 è evidenza della versione precedente, non un collaudo
estensivo di tutte le schermate della6.5.14. Download GitHub non aggiornato.