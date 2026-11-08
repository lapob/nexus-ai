# Prova locale di ascolto durante la risposta

Stato: prototipo web, disattivato nel percorso pubblico. Non costituisce
full-duplex su Android o Electron e non gestisce ancora l'interruzione durante
la generazione del testo tramite voce (il tocco sul Core annulla la risposta). Nessuna registrazione umana è stata valutata.

Il parametro `voiceDuplex=1` abilita il prototipo solo su hostname loopback.
Usare `http://127.0.0.1:32147/?voiceDuplex=1` sul computer del servizio.
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

La voce live della web app unica (`web/src/voice.ts`, ciclo in `web/src/App.tsx`)
è collaudata nel browser con un microfono sintetico: ascolto, trascrizione,
risposta, sintesi, interruzione parlando sopra (monitor con cancellazione
dell'eco) e chiusura pulita. Non misura eco acustico reale, accuratezza STT
o qualità conversazionale: servono prove umane su dispositivi reali.

La preparazione della sintesi è annullabile al tocco e all'uscita. Le risposte
audio tardive vengono ignorate, anche se il trasporto restituisce dati dopo
l'annullamento. Lo stato speaking inizia solo quando il playback è avviato.
