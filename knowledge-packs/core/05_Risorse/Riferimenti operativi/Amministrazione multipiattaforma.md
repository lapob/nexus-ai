---
title: Amministrazione multipiattaforma
type: command-reference
area: systems-administration
status: evergreen
level: foundation
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: curated
tags: [windows, linux, macos, bsd, commands, administration]
aliases: [Comandi amministrazione multipiattaforma]
---

# Amministrazione multipiattaforma

## Identità e sistema

| Obiettivo | Windows PowerShell | Linux | macOS/BSD |
|---|---|---|---|
| host | `$env:COMPUTERNAME` | `hostnamectl` | `scutil --get ComputerName` / `hostname` |
| utente | `whoami /all` | `id` | `id` |
| versione | `Get-ComputerInfo` | `cat /etc/os-release` | `sw_vers` / `uname -a` |
| uptime | `(Get-Date)-(gcim Win32_OperatingSystem).LastBootUpTime` | `uptime` | `uptime` |

## Processi

```powershell
Get-Process
Get-CimInstance Win32_Process
Stop-Process -Id $pid -WhatIf
```

```bash
ps auxf
pgrep -af process
kill -TERM PID
```

Prova prima un arresto gestibile; `KILL` impedisce cleanup.

## Servizi

```powershell
Get-Service
Get-Service Name | Format-List *
Restart-Service Name -WhatIf
```

```bash
systemctl status service
journalctl -u service --since today
service service status          # BSD
launchctl print system/service  # macOS
```

## Pacchetti

```powershell
winget list
winget upgrade
Get-AppxPackage
```

```bash
apt list --upgradable
dnf check-update
pacman -Qu
zypper list-updates
brew outdated
pkg version -vIL=              # FreeBSD
```

Leggi sempre il piano prima di aggiornamenti massivi.

## Storage

```powershell
Get-Disk
Get-Partition
Get-Volume
Get-PhysicalDisk
```

```bash
lsblk -f
findmnt
df -hT
diskutil list    # macOS
gpart show       # FreeBSD
```

## Rete

```powershell
Get-NetIPConfiguration
Get-NetRoute
Get-NetTCPConnection
Resolve-DnsName example.org
Test-NetConnection example.org -Port 443
```

```bash
ip -br address
ip route
ss -lntup
dig example.org
nc -vz example.org 443
ifconfig            # macOS/BSD
route -n get default
```

## Log

```powershell
Get-WinEvent -LogName System -MaxEvents 50
Get-WinEvent -ListLog *
```

```bash
journalctl -b -p warning
tail -f /var/log/system.log
log show --last 30m --style compact  # macOS
```

## File e permessi

```powershell
Get-Item -LiteralPath $path
Get-Acl -LiteralPath $path
Get-FileHash -LiteralPath $path -Algorithm SHA256
```

```bash
stat file
namei -l /path
getfacl file
sha256sum file
shasum -a 256 file  # macOS
```

## Ambiente di sviluppo

```bash
git --version
python --version
node --version
java -version
dotnet --info
go version
rustc --version
flutter doctor -v
```

## Regola professionale

Ogni comando mutativo deve avere contesto, target esplicito, preview/dry-run, output atteso, rollback e verifica.

## Collegamenti

- [[05_Risorse/Metodo professionale per comandi procedure e troubleshooting|Metodo professionale]]
- [[Comandi Linux riferimento completo]]
- [[Comandi PowerShell]]
- [[01_Informatica/Sistemi Operativi/macOS Unix e BSD amministrazione essenziale|macOS e BSD]]
