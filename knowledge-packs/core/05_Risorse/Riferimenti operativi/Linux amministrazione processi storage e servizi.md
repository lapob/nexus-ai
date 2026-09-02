---
title: Linux: amministrazione, processi, storage e servizi
type: reference
area: linux
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: official-docs
tags: [linux, systemd, storage, processes]
aliases: [Comandi amministrazione Linux]
---

# Linux: amministrazione, processi, storage e servizi

```bash
uname -a
cat /etc/os-release
uptime
free -h
ps aux --sort=-%cpu
pstree -ap
vmstat 1
pidstat -dur 1
lsof -p PID
strace -f -p PID
systemctl list-units --failed
systemctl status servizio
journalctl -u servizio --since today
journalctl -p warning..alert -b
systemd-analyze critical-chain
lsblk -f
findmnt
df -hT
du -xhd1 /percorso | sort -h
sudo smartctl -a /dev/sdX
sudo nvme smart-log /dev/nvme0
sudo lsof +L1
id utente
sudo -l -U utente
namei -l /percorso/file
getfacl /percorso
```

`mkfs`, `fdisk`, `parted`, `wipefs`, `dd` e resize sono distruttivi: risolvere
prima device, mount, backup e recovery. Usare `--help` e man page della versione
installata.
