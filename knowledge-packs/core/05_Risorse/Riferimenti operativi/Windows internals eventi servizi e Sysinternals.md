---
title: Windows internals, eventi, servizi e Sysinternals
type: reference
area: windows
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: official-docs
tags: [windows, sysinternals, event-log, services]
aliases: [Comandi Windows avanzati]
---

# Windows internals, eventi, servizi e Sysinternals

```powershell
whoami /all
Get-ComputerInfo
Get-CimInstance Win32_OperatingSystem
Get-HotFix | Sort-Object InstalledOn -Descending
Get-CimInstance Win32_Process |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine
Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2,3;StartTime=(Get-Date).AddDays(-1)}
Get-WinEvent -FilterHashtable @{LogName='Application';ProviderName='Application Error'} -MaxEvents 50
wevtutil.exe epl System C:\Evidence\System.evtx
Get-CimInstance Win32_Service | Select-Object Name,State,StartMode,PathName
Get-ScheduledTask | Where-Object State -ne Disabled
Get-CimInstance Win32_StartupCommand
DISM.exe /Online /Cleanup-Image /ScanHealth
sfc.exe /verifyonly
Get-AuthenticodeSignature C:\Path\file.exe
Get-FileHash C:\Path\file.exe -Algorithm SHA256
```

Process Explorer analizza process tree, token, handle e DLL; Autoruns la
persistence; Process Monitor file, registry e processi; TCPView socket;
Sigcheck firme e hash; RAMMap memoria. Salvare evidenze prima di modificare.
