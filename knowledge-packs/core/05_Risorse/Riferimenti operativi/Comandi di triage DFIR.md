---
title: Comandi di triage DFIR
type: command-reference
area: dfir
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: curated
tags: [dfir, triage, commands, evidence, incident-response]
aliases: [Comandi DFIR e triage]
---

# Comandi di triage DFIR

> Preserva ordine di volatilità, autorizzazione, timezone, tool version e chain of custody. Evita “pulizia” prima della raccolta.

## Identità del sistema

```powershell
Get-Date -Format o
hostname
whoami /all
Get-ComputerInfo | Select-Object WindowsProductName,OsVersion,OsBuildNumber
```

```bash
date -Is
hostnamectl
id
uname -a
uptime
```

## Processi e rete Windows

```powershell
Get-CimInstance Win32_Process |
  Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine
Get-NetTCPConnection |
  Sort-Object State,RemoteAddress
Get-NetUDPEndpoint
Get-DnsClientCache
Get-SmbSession
Get-SmbConnection
```

```text
tasklist /v
netstat -ano
quser
wevtutil el
```

## Processi e rete Linux

```bash
ps auxf
ss -plantu
lsof -nP
ip -br address
ip route
ip neigh
last -Faiwx
lastlog
who -a
```

## Persistenze Windows

```powershell
Get-CimInstance Win32_StartupCommand
Get-ScheduledTask
Get-CimInstance Win32_Service |
  Select-Object Name,State,StartMode,StartName,PathName
Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'
```

Autoruns esporta una baseline leggibile; documenta opzioni e firma dei file invece di cancellare voci.

## Persistenze Linux

```bash
systemctl list-unit-files --state=enabled
systemctl list-timers --all
find /etc/cron* /var/spool/cron -maxdepth 2 -type f -ls
find /etc/systemd /usr/lib/systemd -type f -mtime -7 -ls
```

## Event Log

```powershell
Get-WinEvent -FilterHashtable @{
  LogName='Security'
  StartTime=(Get-Date).AddHours(-4)
} | Export-Csv security-events.csv -NoTypeInformation

wevtutil epl System system.evtx
wevtutil epl Security security.evtx
```

Query mirate riducono volume. Mantieni EVTX originale e lavora su copia.

## Journal e log Linux

```bash
journalctl --since '-4 hours' --output short-iso
journalctl -u ssh --since today
journalctl -k -b
find /var/log -type f -mmin -240 -ls
```

## File recenti e hash

```powershell
Get-ChildItem C:\Path -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object LastWriteTime -gt (Get-Date).AddHours(-4) |
  Select-Object FullName,Length,CreationTimeUtc,LastWriteTimeUtc
Get-FileHash C:\Path\file -Algorithm SHA256
```

```bash
find /path -xdev -type f -mmin -240 -printf '%TY-%Tm-%TdT%TH:%TM:%TS %s %p\n'
sha256sum file
stat file
```

## osquery

```sql
SELECT pid, parent, name, path, cmdline FROM processes;
SELECT pid, local_address, local_port, remote_address, remote_port
FROM process_open_sockets;
SELECT name, path, source FROM startup_items;
```

Conserva versione, pack e query. L’assenza nel risultato può dipendere da permessi o timing.

## Volatility

```bash
vol -f memory.raw windows.info
vol -f memory.raw windows.pstree
vol -f memory.raw windows.netscan
vol -f memory.raw windows.filescan
```

## Timeline e regole

Plaso/Timesketch aggregano timeline; Hayabusa/Chainsaw applicano regole a EVTX. Prima valida mapping, timezone e versione delle regole. Un match non è una conclusione.

## Packaging

```powershell
Compress-Archive -LiteralPath .\evidence -DestinationPath .\evidence.zip
Get-FileHash .\evidence.zip -Algorithm SHA256
```

```bash
tar --xattrs --acls -czf evidence.tar.gz evidence/
sha256sum evidence.tar.gz
```

## Collegamenti

- [[02_Cybersecurity/Digital Forensics e Malware Analysis/Triage forense Windows e Linux|Triage forense]]
- [[02_Cybersecurity/Digital Forensics e Malware Analysis/Memory forensics Windows Linux e timeline|Memory forensics]]
- [[02_Cybersecurity/Blue Team/Incident Response|Incident Response]]
