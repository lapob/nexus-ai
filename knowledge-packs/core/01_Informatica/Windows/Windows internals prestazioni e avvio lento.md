---
title: Windows internals, prestazioni e avvio lento
type: technical-guide
area: windows
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [windows, performance, startup, diagnostics]
aliases: [Diagnostica avvio Windows]
---

# Windows internals, prestazioni e avvio lento

## Sintesi

Registra sintomo, durata, frequenza, ultimo stato funzionante e modifiche recenti.

## Avvio

- Task Manager mostra le startup app e il loro impatto.
- `Microsoft-Windows-Diagnostics-Performance/Operational` documenta avvio e arresto.
- Autoruns mostra persistenze; nascondi prima le voci Microsoft.
- Process Explorer ispeziona firma, parent process, thread e handle.

```powershell
Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location
Get-Service | Sort-Object Status,Name
Get-WinEvent -FilterHashtable @{LogName='System'; Level=2} -MaxEvents 50
```

## Prestazioni

Individua la risorsa satura: CPU e thread; memoria, commit e paging; latenza e coda disco; engine GPU e VRAM; latenza, perdita, DNS e throughput di rete. Correlare timestamp e azione è più utile di una media isolata.

## Integrità

```powershell
DISM /Online /Cleanup-Image /ScanHealth
sfc /verifyonly
chkdsk C: /scan
```

Ripara soltanto dopo diagnosi e backup. DLL scaricate da siti casuali non sono una correzione sicura. Confronta metriche prima/dopo, riavvia almeno due volte e conserva il rollback.

## Collegamenti

- [[Diagnostica Windows e PowerShell]]
- [[05_Risorse/Riferimenti operativi/Windows internals eventi servizi e Sysinternals|Windows internals e Sysinternals]]
