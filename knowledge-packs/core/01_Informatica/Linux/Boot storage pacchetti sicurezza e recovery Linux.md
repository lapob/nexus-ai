---
title: Boot, storage, pacchetti, sicurezza e recovery Linux
type: technical-guide
area: linux
status: evergreen
level: advanced
visibility: public
created: 2026-07-30
updated: 2026-08-08
source_kind: curated
tags: [linux, boot, storage, systemd, packages, selinux, apparmor, recovery]
aliases: [Recovery Linux, Linux operativo avanzato]
---

# Boot, storage, pacchetti, sicurezza e recovery Linux

## Catena di avvio

Firmware -> bootloader -> kernel e initramfs -> PID 1 -> target e servizi. Individuare lo stadio che fallisce prima di tentare una riparazione.

```bash
systemd-analyze
systemd-analyze blame
systemd-analyze critical-chain
journalctl -b -p warning
journalctl -b -1 -p warning
cat /proc/cmdline
lsinitramfs /boot/initrd.img-$(uname -r) 2>/dev/null
```

`journalctl -b -1` osserva il boot precedente se il journal è persistente. Conservare output prima di rigenerare initramfs o modificare il bootloader.

## systemd come grafo di dipendenze

```bash
systemctl status nginx --no-pager
systemctl show nginx -p After -p Requires -p Wants -p FragmentPath
systemctl list-dependencies nginx
journalctl -u nginx --since '-30 min'
systemd-analyze verify /etc/systemd/system/example.service
```

`After=` ordina ma non implica dipendenza; `Requires=` crea dipendenza forte; `Wants=` debole. Usare override anziché modificare unit del pacchetto:

```bash
sudo systemctl edit example.service
sudo systemctl daemon-reload
sudo systemctl restart example.service
```

## Storage e filesystem

```bash
lsblk -o NAME,TYPE,FSTYPE,SIZE,MOUNTPOINTS,UUID
findmnt --verify
df -hT
df -ih
du -xhd1 /var | sort -h
sudo smartctl -a /dev/sdX
sudo nvme smart-log /dev/nvme0
```

Spazio libero e inode liberi sono problemi distinti. `du` e `df` possono divergere per file cancellati ma ancora aperti:

```bash
sudo lsof +L1
```

Non eseguire `fsck` su filesystem montati in scrittura. Acquisire SMART, backup e mappa delle partizioni prima di operazioni invasive.

## LVM e recovery controllata

```bash
sudo pvs
sudo vgs
sudo lvs -a -o +devices
sudo vgcfgbackup
```

Snapshot non è backup: condivide il dominio di guasto. Provare restore su copie o VM. Prima di ridimensionare, verificare ordine richiesto da filesystem e volume; alcuni filesystem crescono online ma non si riducono.

## Pacchetti e provenienza

Debian/Ubuntu:

```bash
apt-cache policy package
dpkg -S /percorso/file
dpkg -V package
sudo apt-get update
sudo apt-get --simulate upgrade
```

Fedora/RHEL:

```bash
dnf info package
rpm -qf /percorso/file
rpm -V package
sudo dnf check-update
```

Arch:

```bash
pacman -Qi package
pacman -Qo /percorso/file
pacman -Qkk package
```

Non mescolare repository incompatibili. Verificare firma, origine e changelog; predisporre rollback prima di aggiornamenti critici.

## SELinux, AppArmor e capability

Un `Permission denied` con DAC corretto può derivare da MAC.

```bash
id
namei -l /path/to/file
getfacl /path/to/file
getcap -r /path/to/binary 2>/dev/null
getenforce 2>/dev/null
sudo ausearch -m AVC -ts recent 2>/dev/null
aa-status 2>/dev/null
```

Non disabilitare SELinux/AppArmor per “risolvere”. Identificare policy, contesto, profilo e operazione. Una capability su un eseguibile può concedere privilegi anche senza bit setuid.

## Recovery

1. fermare scritture se c'è rischio dati;
2. acquisire stato e log;
3. verificare backup e supporto di avvio;
4. lavorare da rescue environment quando necessario;
5. montare read-only per ispezione;
6. correggere la causa minima;
7. verificare filesystem, servizi, rete e aggiornamenti;
8. documentare e creare prevenzione.

## Scenario tecnico
In una VM clonabile introdurre: unit con dipendenza errata, filesystem pieno di inode, ACL che nega accesso e pacchetto con file modificato. Diagnosticare senza reboot iniziale e produrre un runbook con rollback.

## Collegamenti

- [[Fondamenti e amministrazione Linux]]
- [[Linux internals namespace cgroup eBPF e diagnostica kernel]]
- [[05_Risorse/Riferimenti operativi/Comandi Linux riferimento completo|Comandi Linux riferimento completo]]
- [[02_Cybersecurity/Blue Team/Incident Response|Incident Response]]
- [[02_Cybersecurity/Digital Forensics e Malware Analysis/Triage forense Windows e Linux|Triage forense]]
