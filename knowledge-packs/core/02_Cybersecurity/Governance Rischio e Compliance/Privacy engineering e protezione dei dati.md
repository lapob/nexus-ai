---
title: Privacy engineering e protezione dei dati
type: guide
area: governance-risk-and-compliance
status: evergreen
level: intermediate
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [privacy, data-protection, threat-modeling, governance]
aliases: [privacy engineering]
---

# Privacy engineering e protezione dei dati

La privacy engineering traduce principi legali e aspettative umane in requisiti verificabili di prodotto. Parte dai flussi di dati: quali informazioni entrano, perché, dove passano, chi le usa, per quanto tempo restano e come vengono eliminate.

## Metodo

1. costruisci inventario e diagrammi dei flussi;
2. classifica dati, finalità, basi e soggetti coinvolti con supporto legale competente;
3. minimizza raccolta, precisione e conservazione;
4. separa identificatori e contenuto, applicando least privilege;
5. definisci cancellazione, esportazione, rettifica e audit;
6. usa threat modeling privacy: linkability, identifiability, detectability e disclosure;
7. verifica con test, telemetria minimizzata e revisioni periodiche.

## Tecniche

Pseudonimizzazione riduce il collegamento diretto ma non rende anonimi i dati. Differential privacy limita matematicamente il contributo di un individuo in analisi aggregate. Federated learning evita alcuni trasferimenti ma non elimina leakage, poisoning o necessità di governance. La crittografia protegge dati in transito e a riposo; non impedisce l'uso improprio da parte di chi può decifrarli.

## Criteri di qualità

Ogni dato ha proprietario, finalità, retention, controllo di accesso e procedura di cancellazione verificata. Log e backup rispettano la stessa politica. Le interfacce non usano dark pattern e il consenso, quando richiesto, è comprensibile e revocabile.

## Fonti primarie

- NIST Privacy Framework, https://www.nist.gov/privacy-framework
- ENISA Data Protection Engineering, https://www.enisa.europa.eu/publications/data-protection-engineering
- European Data Protection Board, https://www.edpb.europa.eu/our-work-tools/our-documents_en
