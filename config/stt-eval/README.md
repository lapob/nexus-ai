# Corpus STT NexusNXS

Questa directory descrive il formato del corpus vocale reale. Le registrazioni non vanno pubblicate nel repository: restano nei dati developer sul volume portatile e vengono referenziate da un manifest locale.

Ogni lingua deve avere almeno tre campioni vocali e il corpus dovrebbe coprire microfono integrato, USB, ambiente silenzioso e rumore reale. I casi `noise` misurano i falsi richiami e devono avere `text` vuoto.

Esecuzione:

```powershell
npm run voice:evaluate:stt -- --dataset="..\.nexus-data\evals\stt\manifest.json" --min-language-cases=3 --min-accuracy=85 --max-false-positive=5
```

Il report contiene WER, accuratezza per lingua/dispositivo/ambiente, latenza p50/p95 e tasso di falsa attivazione. Non contiene audio incorporato.
