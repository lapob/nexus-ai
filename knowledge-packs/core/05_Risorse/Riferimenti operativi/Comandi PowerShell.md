---
title: Comandi PowerShell
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

# Comandi PowerShell

Riferimento operativo per usare PowerShell in modo rapido su Windows, WSL, Git e attivita di amministrazione quotidiana.

## Collegamenti Correlati

- [[01_Informatica/Linux/WSL|WSL]]
- [[01_Informatica/Linux/Fondamenti e amministrazione Linux|Terminale]]
- [[Comandi Git]]
- [[01_Informatica/Git e GitHub/Git operativo e collaborazione|Comandi Git]]

## Tabella Comando -> Descrizione

| Comando | Descrizione |
|---|---|
| `Get-ChildItem` | Lista file e cartelle. |
| `Set-Location` | Cambia directory. |
| `Get-Content` | Legge il contenuto di un file. |
| `Select-String` | Cerca testo dentro file o output. |
| `Get-Process` | Mostra i processi attivi. |
| `Get-Service` | Mostra i servizi Windows. |
| `Test-Path` | Verifica se un percorso esiste. |
| `Copy-Item` | Copia file o cartelle. |
| `Move-Item` | Sposta file o cartelle. |
| `Remove-Item` | Elimina file o cartelle. |

## Comandi Essenziali

```powershell
Get-ChildItem
Get-ChildItem -Force
Set-Location C:\
Get-Content .\file.txt
Select-String -Path .\file.txt -Pattern "testo"
Get-Process
Get-Service
Test-Path .\file.txt
```

## Esempi Pratici

### Cercare file Markdown

```powershell
Get-ChildItem -Recurse -Filter *.md
```

### Cercare testo in una cartella

```powershell
Get-ChildItem -Recurse -File | Select-String -Pattern "TODO"
```

### Controllare processi attivi

```powershell
Get-Process | Sort-Object CPU -Descending
```

### Pipeline di oggetti

```powershell
Get-Service |
    Where-Object Status -eq 'Running' |
    Sort-Object DisplayName |
    Select-Object Name, DisplayName, Status
```

### JSON e CSV

```powershell
$data = Get-Content -LiteralPath .\config.json -Raw | ConvertFrom-Json
$data | ConvertTo-Json -Depth 10
Get-Process | Select-Object Name, Id, CPU | Export-Csv .\processi.csv -NoTypeInformation
```

### Error handling

```powershell
$ErrorActionPreference = 'Stop'
try {
    Get-Content -LiteralPath .\file.txt
}
catch {
    Write-Error "Lettura fallita: $($_.Exception.Message)"
}
```

### API

```powershell
Invoke-RestMethod -Method Get -Uri 'https://api.example.test/items' -TimeoutSec 20
```

Non inserire token direttamente nella command line o nei file di esempio.

### Lavorare con WSL

```powershell
wsl --list --verbose
wsl --shutdown
```

## Errori Comuni

- Confondere PowerShell con Bash: sintassi, variabili e pipe funzionano in modo diverso.
- Usare percorsi senza virgolette quando contengono spazi.
- Eseguire `Remove-Item` senza controllare prima il percorso.
- Dimenticare che PowerShell lavora spesso con oggetti, non solo testo.

## Indicazioni operative

- Prima di cancellare o spostare file, verificare sempre con `Test-Path` e `Get-ChildItem`.
- Per comandi Linux in ambiente Windows, usare anche [[01_Informatica/Linux/WSL|WSL]].
