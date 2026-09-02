---
title: Git operativo e collaborazione
type: reference
area: tech
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [git, collaboration, version-control]
aliases: [Git operativo]
---

# Git operativo e collaborazione

## Modello mentale

Working tree, staging area e commit sono stati diversi. Un branch è un riferimento mobile; un merge combina storie; un rebase riscrive commit e richiede attenzione se condivisi.

## Ciclo locale

```bash
git status
git diff
git add percorso
git diff --cached
git commit
git log --oneline --decorate --graph
```

Prima di ogni modifica rischiosa controlla stato, diff e branch. Non inserire segreti: rimuoverli dall'ultimo file non li elimina automaticamente dalla storia.

## Branch e review

- un branch per modifica coerente;
- commit piccoli che spiegano il “perché”;
- descrizione con problema, soluzione, test e rischi;
- review del diff, non solo del risultato visibile;
- risoluzione conflitti verificata con test.

## Recupero sicuro

- `git restore --staged file` rimuove dallo staging senza cancellare il file;
- `git reflog` aiuta a ritrovare riferimenti locali;
- `git revert` aggiunge un commit inverso senza riscrivere storia condivisa;
- evita reset distruttivi finché non hai identificato esattamente cosa perderesti.

## Gate

- [ ] So separare modifiche non correlate.
- [ ] So leggere e spiegare un diff.
- [ ] So risolvere un conflitto mantenendo entrambe le intenzioni.
- [ ] So recuperare un commit tramite reflog in un repository di prova.
