---
title: Ricerca testo: Regex, jq, sed, awk e ripgrep
type: reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-24
updated: 2026-07-24
source_kind: curated
tags: [commands, regex, ripgrep, jq, sed, awk, text-processing]
aliases: [Comandi ricerca testo, Regex e text processing]
---

# Ricerca testo: Regex, jq, sed, awk e ripgrep

> [!tip]
> Prima cerca e visualizza; modifica soltanto dopo aver verificato il set di file. Su dati aziendali evita output contenenti segreti o dati personali.

## ripgrep

```bash
rg "pattern"
rg -n -i "errore|warning" .
rg --files -g "*.ts" -g "!node_modules/**"
rg -C 3 "timeout" logs/
rg -l "TODO" src/
rg -o "[A-Fa-f0-9]{64}" .
rg --json "pattern" .
```

Regex utili:

```text
^inizio                 inizio riga
fine$                   fine riga
\bparola\b              parola intera
(foo|bar)               alternativa
[A-Za-z0-9._-]+         insieme/ripetizione
(?i)errore              case-insensitive inline
https?://[^\s]+         URL semplice
```

## jq

```bash
jq . file.json
jq '.items[] | {id, name}' file.json
jq -r '.items[].name' file.json
jq 'map(select(.enabled == true))' file.json
jq 'group_by(.status) | map({status: .[0].status, count: length})' file.json
curl -s http://127.0.0.1:11434/api/tags | jq '.models[].name'
```

Usa `-r` quando vuoi testo senza virgolette; senza `-r` mantieni JSON valido.

## sed

```bash
sed -n '1,40p' file.txt
sed -n '/START/,/END/p' file.txt
sed 's/vecchio/nuovo/g' file.txt
sed -E 's/[[:space:]]+$//' file.txt
```

Prima di usare `-i`, genera output o backup e controlla differenze.

## awk

```bash
awk '{print $1}' file.txt
awk -F, 'NR > 1 {print $2}' file.csv
awk '$3 > 80 {print $1, $3}' dati.txt
awk '{count[$1]++} END {for (key in count) print key, count[key]}' file.txt
```

Per CSV con quoting complesso usa un parser CSV, non `awk -F,`.

## PowerShell equivalenti

```powershell
Select-String -Path .\logs\*.log -Pattern 'error|warning'
Get-ChildItem -Recurse -Filter *.ts | Select-String -Pattern 'TODO'
Get-Content -Raw .\file.json | ConvertFrom-Json
Get-Content .\file.txt | Where-Object { $_ -match 'pattern' }
```

## Collegamenti

- [[Indice - Riferimenti operativi]]
- [[05_Risorse/Catalogo dei comandi|Catalogo dei comandi]]
- [[01_Informatica/Bash/Bash per automazione|Bash per automazione]]
- [[03_Sviluppo/Linguaggi/Shell e PowerShell|Shell e PowerShell]]
