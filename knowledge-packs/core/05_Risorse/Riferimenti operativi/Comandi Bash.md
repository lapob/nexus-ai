---
title: Comandi Bash
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

# Comandi Bash

Riferimento operativo per comandi e pattern Bash.

## Concetti Chiave

- Pipeline, variabili, script, redirect e automazione.
- Collegamenti: [[01_Informatica/Bash/Bash per automazione]], [[Catalogo dei comandi|Catalogo dei comandi]]

## Pattern essenziali

```bash
set -Eeuo pipefail
name=${1:-default}
printf '%s\n' "$name"
[[ -f "$name" ]] || exit 2
while IFS= read -r line; do
  printf '%s\n' "$line"
done < file.txt
```

## Condizioni e cicli

```bash
if [[ -d "$path" ]]; then
  printf 'directory valida\n'
fi

for file in ./*.md; do
  [[ -e "$file" ]] || continue
  printf '%s\n' "$file"
done
```

## Funzioni e cleanup

```bash
cleanup() {
  rm -f -- "$temporary_file"
}
trap cleanup EXIT

die() {
  printf 'errore: %s\n' "$*" >&2
  exit 1
}
```

Prima di usare `rm`, verifica che la variabile sia valorizzata e confinata nella directory prevista.
