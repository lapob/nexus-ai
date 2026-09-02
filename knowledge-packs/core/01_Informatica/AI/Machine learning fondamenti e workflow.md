---
title: Machine learning: fondamenti e workflow
type: technical-guide
area: ai
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [machine-learning, data-science, evaluation]
aliases: []
---

# Machine learning: fondamenti e workflow

## Tipi di apprendimento

Supervised usa coppie input-target; unsupervised cerca struttura; self-supervised
crea segnali dai dati; reinforcement learning ottimizza ricompense attraverso
interazioni. Classificazione predice categorie, regressione valori, ranking un
ordinamento, clustering gruppi.

## Workflow corretto

1. definire decisione, rischio, baseline e metrica;
2. raccogliere dati autorizzati e rappresentativi;
3. versionare schema, feature e label;
4. separare train, validation e test evitando leakage;
5. addestrare baseline semplice;
6. analizzare errori per segmento;
7. calibrare e scegliere soglie;
8. validare robustezza, bias, latenza e costo;
9. distribuire gradualmente con monitoraggio e rollback.

Bias è errore sistematico; variance sensibilità ai dati. Regularization,
augmentation e più dati possono ridurre overfitting, ma soltanto se coerenti con
il dominio. Cross-validation stima variabilità quando i dati sono limitati.

## Metriche

Confusion matrix produce precision, recall, specificity e F1. ROC-AUC può
ingannare con classi molto sbilanciate; PR-AUC è spesso più informativa.
Calibration misura se probabilità predette corrispondono a frequenze reali.
Metriche offline devono essere collegate a impatto operativo.

## Drift

Data drift cambia input, concept drift cambia relazione input-target. Monitorare
distribuzioni, performance ritardata, qualità label e segmenti critici. Non
riaddestrare automaticamente su output non verificati.
