---
title: Windows kernel, processi, token, ETW e diagnostica avanzata
type: technical-guide
area: windows
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [windows, kernel, token, etw, performance, diagnostics]
aliases: [Windows internals avanzati]
---

# Windows kernel, processi, token, ETW e diagnostica avanzata

## Architettura

Windows separa user mode e kernel mode. Executive, kernel, HAL e driver gestiscono oggetti, memoria, I/O, sicurezza e scheduling. I processi contengono spazio virtuale e handle; i thread sono unità schedulabili.

## Processi e handle

```powershell
Get-Process | Sort-Object CPU -Descending | Select-Object -First 15
Get-CimInstance Win32_Process |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine
Get-Process -Id $pid | Select-Object -ExpandProperty Modules
```

Process Explorer e Handle mostrano parent, firma, integrity level, token, DLL, handle e thread. Un processo con nome legittimo non è automaticamente trusted: verifica percorso e firma.

## Token e integrità

Il token contiene SID utente/gruppi, privilegi, integrity level, restrizioni e logon session. UAC usa token filtrati per attività quotidiane.

```powershell
whoami /all
whoami /priv
whoami /groups
Get-Acl C:\Path | Format-List
```

Distinguere ACL del file, privilege del token, ownership e contesto del servizio.

## Servizi

```powershell
Get-CimInstance Win32_Service |
  Select-Object Name,State,StartMode,StartName,PathName
sc.exe qc ServiceName
sc.exe queryex ServiceName
```

Verifica account, quoting del percorso, ACL binario/configurazione, dipendenze, recovery action e trigger. Non cambiare il logon account senza conoscere accessi e secret associati.

## ETW ed Event Log

Event Tracing for Windows produce eventi ad alte prestazioni da provider kernel e applicativi. Event Log conserva canali amministrativi e operativi.

```powershell
Get-WinEvent -ListProvider * | Select-Object -First 20 Name
Get-WinEvent -FilterHashtable @{
  LogName='System'
  StartTime=(Get-Date).AddHours(-1)
} | Select-Object TimeCreated,Id,ProviderName,Message
```

Windows Performance Recorder/Analyzer usa ETW per boot, CPU, disk, memory e UI. Registra una finestra breve e riproducibile; le trace possono contenere percorsi e command line.

## Dump e WinDbg

Un dump può essere mini, heap o full. Conserva build, simboli e hash. In WinDbg:

```text
!analyze -v
k
lm
!process 0 1
!thread
!handle
```

L’analisi automatica è un punto di partenza. Conferma stack, eccezione, modulo, thread e contesto.

## Scenario tecnico
Crea un’app di training che genera un’eccezione controllata, raccogli Event Log e dump, carica simboli, individua thread e stack e scrivi root cause e fix.

## Collegamenti

- [[Diagnostica Windows e PowerShell]]
- [[Windows internals prestazioni e avvio lento]]
- [[05_Risorse/Riferimenti operativi/Windows internals eventi servizi e Sysinternals|Sysinternals]]
