---
title: Bash per automazione
type: reference
area: tech
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [bash, automation, scripting]
aliases: [Automazione Bash]
---

# Bash per automazione

## Scheletro affidabile

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

usage() { printf 'Uso: %s <directory>\n' "$0"; }
die() { printf 'errore: %s\n' "$*" >&2; exit 1; }

[[ $# -eq 1 ]] || { usage; exit 2; }
target=$1
[[ -d "$target" ]] || die "directory inesistente"
```

## Regole

- quota sempre le espansioni: `"$variable"`;
- usa array per liste di argomenti, non stringhe concatenate;
- tratta input, nomi file e output di comandi come non fidati;
- preferisci `while IFS= read -r` a parsing fragile di `ls`;
- usa exit code distinti e scrivi errori su stderr;
- aggiungi `--dry-run` prima di operazioni distruttive;
- rendi idempotente ciò che può essere rieseguito.

## Verifica

```bash
bash -n script.sh
shellcheck script.sh
```

Testa almeno: input valido, mancante, spazi nel percorso, permessi negati, dipendenza assente e interruzione.

## Quando usare altro

Bash è ottimo per orchestrare comandi e file. Per parsing complesso, strutture dati, API o logica estesa, passa a [[01_Informatica/Python/Python per automazione e sicurezza|Python]].
