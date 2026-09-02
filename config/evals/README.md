# NexusNXS AI eval lab

Le suite in questa cartella sono dataset di valutazione sintetici e versionati.
Non contengono conversazioni degli utenti e non vengono usate direttamente per
l'addestramento.

## Regole di versione

- Patch: correzione di un'asserzione senza cambiare la capacità misurata.
- Minor: nuovi casi o una nuova categoria compatibile.
- Major: cambi incompatibili a schema, scoring o significato delle soglie.
- Un caso pubblicato non cambia significato: per sostituirlo si crea un nuovo ID.

Ogni suite dichiara provenienza, assenza di dati reali, uso esclusivo per eval,
soglia globale e soglie per categoria. I casi `mustPass` bloccano il gate anche
quando la media complessiva è sufficiente.

## Comandi

```powershell
npm run ai:eval:lab:validate
npm run ai:eval:lab:gate -- qwen3:8b qwen3:14b
```

La modalita `quick` usa il parametro nativo `think: false`, senza anteporre
comandi al prompt dell'utente. Le istruzioni base, di categoria e specifiche del
caso vengono composte in un unico messaggio di sistema. Quando un caso dichiara
`outputSchema`, lo stesso schema viene inviato a Ollama come formato strutturato:
lo scorer resta quindi indipendente dal modello e non corregge le risposte.

`--deep` abilita il ragionamento nativo per misurazioni separate. I risultati
quick e deep non vanno confrontati come se avessero lo stesso profilo di latenza.

Il report non conserva prompt o risposte: espone soltanto ID del caso, esito,
latenza, asserzioni e hash breve della risposta. Questo rende lo schema stabile,
riduce il rischio di memorizzare dati sensibili e consente confronti tra release.

Le fixture offline sono ammesse soltanto nei test automatici. Un gate di release
deve sempre essere eseguito sui modelli effettivi della workstation.
