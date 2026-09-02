---
title: Windows CMD e amministrazione
type: reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-07-23
source_kind: curated
tags: [windows, cmd, administration, commands]
aliases: [Windows Commands, CMD Commands]
---

# Windows CMD e amministrazione

## Sistema e identità

```bat
whoami
whoami /all
hostname
systeminfo
ver
set
where.exe nome-programma
```

## File

```bat
dir
dir /a
cd /d C:\percorso
type file.txt
copy origine.txt destinazione.txt
move vecchio.txt nuovo.txt
mkdir cartella
fc file1.txt file2.txt
```

Prima di `del`, `rmdir` o operazioni ricorsive verifica il percorso con `dir` e preferisci backup o cestino quando possibile.

## Processi e servizi

```bat
tasklist
tasklist /svc
tasklist /fi "IMAGENAME eq programma.exe"
sc query
sc query nome-servizio
schtasks /query /fo LIST /v
```

In PowerShell:

```powershell
Get-Process
Get-CimInstance Win32_Process |
    Select-Object ProcessId, ParentProcessId, Name, CommandLine
Get-Service
Get-ScheduledTask
```

## Rete

```bat
ipconfig /all
route print
arp -a
ping 192.0.2.1
tracert example.com
nslookup example.com
netstat -ano
```

```powershell
Get-NetIPConfiguration
Get-NetRoute
Get-NetTCPConnection
Resolve-DnsName example.com
Test-NetConnection example.com -Port 443
```

## Log ed eventi

```powershell
Get-WinEvent -LogName System -MaxEvents 20
Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    StartTime = (Get-Date).AddHours(-1)
}
```

L'accesso ad alcuni eventi richiede privilegi. Esporta solo dati necessari e minimizza informazioni personali.

## Hash e firme

```bat
certutil -hashfile file.iso SHA256
```

```powershell
Get-FileHash .\file.iso -Algorithm SHA256
Get-AuthenticodeSignature .\programma.exe
```

## Riparazione e diagnostica

```bat
sfc /verifyonly
chkdsk C: /scan
wevtutil el
driverquery
```

I comandi che modificano componenti di sistema, disco, firewall o servizi richiedono una procedura separata con backup e rollback.

## Collegamenti

- [[Comandi PowerShell]]
- [[01_Informatica/Linux/WSL|WSL]]
- [[02_Cybersecurity/Identity Windows e Active Directory/Indice - Identity Windows e Active Directory|Windows e Active Directory]]
