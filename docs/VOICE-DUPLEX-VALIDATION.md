# Prova locale di ascolto durante la risposta

Stato: prototipo web, disattivato nel percorso pubblico. Non costituisce
full-duplex su Android o Electron e non gestisce ancora l'interruzione durante
la generazione del testo. Nessuna registrazione umana è stata valutata.

Il parametro `voiceDuplex=1` abilita il prototipo solo su hostname loopback.
Usare `http://127.0.0.1:32145/?voiceDuplex=1` sul computer del servizio.
Il browser deve confermare `echoCancellation: true` nelle impostazioni della
traccia audio; in caso contrario resta l'interruzione al tocco.

## Procedura con una persona

1. Consentire il microfono e chiedere una risposta di alcune frasi.
2. Durante la sintesi dire: «Aspetta, rispondi solo in una frase».
3. Verificare che la sintesi si interrompa, che l'inizio della nuova frase sia
   conservato e che venga prodotta una sola risposta alla correzione.
4. Lasciare finire una risposta senza parlare: nessuna auto-interruzione o
   trascrizione della voce sintetica deve generare un nuovo turno.
5. Ripetere con altoparlanti, cuffie e rumore ambientale, annotando browser,
   dispositivi, volume, parole perse e tempo di interruzione.
6. Uscire durante ascolto e sintesi; verificare arresto audio, indicatore del
   microfono spento e ritorno alla conversazione scritta.

Conservare solo risultati tecnici nel repository, non audio o conversazioni
personali. Per confrontare il riconoscimento usare separatamente un corpus
umano autorizzato e `voice:evaluate:stt`, come richiesto da AGENTS.md.

## Verifiche automatiche

`node --test tests/public-voice-session.test.js` controlla concorrenza,
interruzione, fallback senza AEC e rilascio delle risorse con dispositivi
simulati. Non misura eco acustico, accuratezza STT o qualità conversazionale.
Non promuovere il prototipo a predefinito sulla sola base di questi test.
