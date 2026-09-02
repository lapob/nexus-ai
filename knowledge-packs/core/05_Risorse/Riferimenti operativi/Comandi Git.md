---
title: Comandi Git
type: reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-07-23
source_kind: curated
tags: [nexus, resources]
aliases: []
---

# Comandi Git

Riferimento operativo per i comandi Git piu importanti durante lavoro locale, versionamento e collaborazione su GitHub.

## Collegamenti Correlati

- [[01_Informatica/Git e GitHub/Git operativo e collaborazione|Comandi Git]]
- [[01_Informatica/Git e GitHub/Git operativo e collaborazione|Branching]]
- [[01_Informatica/Git e GitHub/Git operativo e collaborazione|Pull Request]]
- [[01_Informatica/Git e GitHub/Git operativo e collaborazione|Workflow GitHub]]
- [[Comandi PowerShell]]

## Tabella Comando -> Descrizione

| Comando | Descrizione |
|---|---|
| `git status` | Mostra stato del repository. |
| `git add` | Aggiunge modifiche allo staging. |
| `git commit` | Salva uno snapshot locale. |
| `git log` | Mostra cronologia commit. |
| `git branch` | Lista o crea branch. |
| `git switch` | Cambia branch. |
| `git pull` | Scarica e integra modifiche remote. |
| `git push` | Invia commit al remote. |
| `git diff` | Mostra differenze non committate. |
| `git restore` | Ripristina file o staging. |

## Comandi Essenziali

```bash
git status
git diff
git add percorso
git diff --cached
git commit
git log --oneline
git branch
git switch nome-branch
```

## Esempi Pratici

### Creare un commit

```bash
git status
git add .
git commit -m "Aggiorna note"
```

### Ispezionare storia e origine di una riga

```bash
git log --oneline --decorate --graph --all
git show commit
git blame percorso/file
```

### Salvare temporaneamente modifiche

```bash
git stash push -m "contesto"
git stash list
git stash show --patch
```

Controlla lo stash prima di applicarlo e non usarlo come archivio permanente.

### Recupero

```bash
git reflog
git restore --staged percorso/file
git revert commit
```

Evita reset distruttivi o force-push finché non hai identificato esattamente storia e collaboratori coinvolti.

### Creare e usare un branch

```bash
git switch -c nuova-feature
git status
git push -u origin nuova-feature
```

### Vedere cosa e cambiato

```bash
git diff
git diff --staged
```

### Sincronizzare con GitHub

```bash
git pull
git push
```

## Errori Comuni

- Fare commit troppo grandi e difficili da leggere.
- Usare `git add .` senza controllare prima `git status`.
- Lavorare sul branch sbagliato.
- Fare `pull` senza aver salvato o compreso le modifiche locali.
- Confondere `restore`, `reset` e `revert`.

## Indicazioni operative

- Prima sequenza mentale: `status`, `diff`, `add`, `commit`, `push`.
- Per workflow completi, usare [[01_Informatica/Git e GitHub/Git operativo e collaborazione|Workflow GitHub]].
