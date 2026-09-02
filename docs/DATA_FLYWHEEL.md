# NexusNXS data flywheel

## Obiettivo

NexusNXS migliora tramite dati approvati, valutazioni indipendenti e promozioni
reversibili. Le conversazioni non modificano automaticamente i pesi. Knowledge,
memoria personale, esempi di comportamento e casi eval restano insiemi distinti.

## Ciclo operativo

1. L'utente contrassegna una risposta come utile oppure la corregge.
2. Una correzione produce una coppia `chosen`/`rejected`; una semplice
   approvazione produce un esempio SFT.
3. I contributi pubblici con consenso entrano in quarantena e non nel dataset.
4. `npm run ai:feedback:review` mostra soltanto metadati dei contributi in
   quarantena. La promozione richiede ID e revisore espliciti, ad esempio
   `npm run ai:feedback:review -- --approve=<id> --reviewer=<nome>`.
5. Lo sviluppatore elimina segreti, duplicati e contenuti senza provenienza.
6. `npm run ai:dataset` genera split deterministici raggruppati per prompt,
   checksum e ricevuta di integrità.
7. `npm run ai:training:plan` mantiene chiusi SFT e DPO finché le rispettive
   soglie non sono raggiunte.
8. Il training QLoRA avviene in un ambiente Python isolato e produce un adapter,
   mai la sostituzione diretta del modello attivo.
9. Baseline e candidato attraversano eval generali, NexusNXS, sicurezza,
   knowledge, latenza e prove umane cieche.
10. `npm run ai:promotion:gate -- baseline.json candidate.json
   --output=promotion-receipt.json` produce una ricevuta e richiede rollback in
   presenza di regressioni o fallimenti must-pass.

## Separazione dei dati

| Insieme | Scopo | Può addestrare i pesi |
| --- | --- | --- |
| Knowledge pubblica | fatti distribuibili, versionati e citabili | no |
| Knowledge privata | documentazione tecnica riservata | no |
| Memoria personale | preferenze e continuità dell'utente | no |
| Esempi SFT | comportamento approvato | sì, dopo revisione |
| Preferenze DPO | risposta scelta contro scartata | sì, dopo revisione |
| Eval | misurazione indipendente | mai |
| Quarantena pubblica | contributi opt-in non ancora verificati | mai direttamente |

## Gate minimi

- almeno 1.000 esempi SFT revisionati per il primo candidato destinato alla
  promozione; i 200 esempi previsti dal formato abilitano soltanto esperimenti;
- almeno 250 preferenze revisionate per un candidato DPO;
- validation e test separati per prompt prima del training;
- zero credenziali e zero dati senza consenso;
- tutti i casi sicurezza e tool-use must-pass;
- nessuna regressione di qualità superiore a 2 punti;
- nessun aumento della mediana o del p95 superiore alla soglia dichiarata;
- model card, dataset ID, checksum, report e rollback conservati insieme.

Le soglie e le politiche non sono duplicate negli script: la fonte autoritativa
è `config/model-factory.json`. In questo modo un cambiamento viene revisionato
una sola volta e training, validazione e promozione applicano gli stessi limiti.

## Ritmo consigliato

- ogni giorno: approvare soltanto risposte verificate e correggere gli errori;
- ogni settimana: dataset, audit knowledge ed eval estese;
- ogni mese o milestone: candidato QLoRA/DPO, confronto cieco e promozione;
- in qualsiasi momento: un incidente diventa un caso eval prima della correzione.
