# Governance di knowledge e dataset NEXUSNXS

Stato: obbligatoria per ogni release
Responsabile: sviluppatore NEXUSNXS

## Tre livelli separati

1. **Knowledge pubblica** — documentazione generale distribuita con l'app,
   verificabile e riutilizzabile secondo la licenza della fonte.
2. **Memoria locale** — preferenze e fatti approvati dal singolo utente. Non
   entra mai automaticamente nei dataset di addestramento.
3. **Dataset privato di sviluppo** — esempi selezionati, ripuliti e autorizzati
   dallo sviluppatore per valutazione, fine-tuning o distillazione.

La retrieval knowledge non equivale all'addestramento: può essere aggiornata
senza modificare i pesi del modello e deve conservare provenienza e data.

## Contributi volontari al miglioramento

Il client pubblico non invia automaticamente conversazioni, allegati, memoria
o file. L'utente può condividere una singola coppia domanda-risposta dal menu
del messaggio, eventualmente correggendola prima. Il server applica limiti,
filtri per segreti e deduplicazione, quindi conserva il contributo in un
archivio di quarantena separato dal modello in produzione.

Un contributo diventa materiale di addestramento soltanto dopo revisione,
sanificazione, separazione dai set di valutazione e superamento dei benchmark.
La raccolta non modifica mai direttamente il modello usato dagli altri utenti.

## Registro minimo per ogni fonte

| Campo | Obbligatorio |
|---|---|
| URL canonico e autore/editore | sì |
| titolo, versione e data di acquisizione | sì |
| licenza e uso consentito | sì |
| hash del contenuto acquisito | sì |
| ambito e lingua | sì |
| trasformazioni applicate | sì |
| revisore e risultato della revisione | sì |

Una fonte con licenza assente, incompatibile o ambigua non entra nel corpus.

## Pipeline

```text
scoperta → verifica origine/licenza → acquisizione → deduplica
→ rimozione PII/segreti → segmentazione → controllo qualità
→ knowledge pubblica oppure dataset privato → evaluation gate → release
```

## Esclusioni

- credenziali, token, segreti, dati aziendali o personali non autorizzati;
- dump, leak, malware operativo e materiale ottenuto illegalmente;
- contenuti sintetici non verificati trattati come verità;
- pagine copiate senza licenza compatibile;
- esempi che insegnano ad aggirare consenso, sandbox o controlli di sicurezza.

## Metriche di prestazione locali

NexusNXS può conservare fino a 1.000 campioni tecnici per calcolare p50, p95 e
p99. Ogni campione contiene esclusivamente tipo di richiesta, classe del
modello, modalità, durata, esito e presenza di una correzione automatica. Non
vengono mai scritti prompt, risposte, nomi dei modelli, percorsi, identificativi
di conversazione o dati del dispositivo. Il file è locale, limitato e
rigenerabile; serve a individuare regressioni senza telemetria cloud.

## Artefatti di release

Ogni modello ufficiale NEXUSNXS deve includere una model card con base model,
licenze, dataset o categorie di dati, limitazioni, benchmark, hardware provato,
versione e changelog. Ogni dataset deve avere una dataset card con composizione,
provenienza, licenza, rischi, bias e uso previsto.

## Riferimenti

- NIST AI RMF e profilo GenAI: <https://www.nist.gov/itl/ai-risk-management-framework>
- Hugging Face Model Cards: <https://huggingface.co/docs/hub/en/model-cards>
- Hugging Face Dataset Cards: <https://huggingface.co/docs/hub/en/datasets-cards>
- OWASP GenAI Security Project: <https://genai.owasp.org/>
