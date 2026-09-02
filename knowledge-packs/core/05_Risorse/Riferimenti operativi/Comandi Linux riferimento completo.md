---
title: Comandi Linux riferimento completo
type: command-reference
area: linux
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: curated
tags: [linux, commands, administration, troubleshooting]
aliases: [Enciclopedia comandi Linux]
---

# Comandi Linux riferimento completo

> Usa `--help`, `man`, `info` e documentazione della distribuzione. Prima di comandi distruttivi verifica target, mount, backup e rollback.

## Orientamento e file

```bash
pwd; ls -lah
find /path -type f -name '*.log'
find /path -xdev -type f -size +1G
file item; stat item
cp -a source destination
install -Dm755 app /usr/local/bin/app
ln -s target link
readlink -f link
```

## Testo e dati

```bash
rg -n 'pattern' path
grep -RIn -- 'pattern' path
sed -n '1,80p' file
awk -F: '{print $1}' /etc/passwd
cut -d, -f1 data.csv
sort file | uniq -c | sort -nr
tr '[:lower:]' '[:upper:]'
jq '.items[] | {name,status}' data.json
xargs -0 command
```

## Processi e risorse

```bash
ps auxf
pgrep -af process
top; free -h; vmstat 1
pidstat -p PID 1
iostat -xz 1
lsof -p PID
strace -f -p PID
nice -n 10 command
renice 10 -p PID
kill -TERM PID
```

## Systemd e log

```bash
systemctl status service
systemctl list-units --failed
systemctl cat service
journalctl -u service --since today
journalctl -b -p warning
journalctl -k
systemd-analyze blame
```

## Utenti e permessi

```bash
id user
getent passwd user
sudo -l
namei -l /path/to/file
getfacl file
setfacl -m u:user:r-- file
chmod 640 file
chown user:group file
find /path -xdev -perm -4000 -type f
```

## Storage

```bash
lsblk -f
blkid
findmnt
df -hT
du -xhd1 /path | sort -h
smartctl -a /dev/device
mount -o ro device /mnt/point
lvs; vgs; pvs
zpool status; zfs list
```

## Rete

```bash
ip -br address
ip route
ip neigh
ss -lntup
resolvectl status
dig +short example.org
curl -vI https://example.org
openssl s_client -connect example.org:443 -servername example.org
ping -c 4 host
traceroute host
mtr -rw host
tcpdump -ni any 'host 192.0.2.10 and port 443'
```

## Pacchetti

```bash
apt update; apt list --upgradable
dpkg -S /path/to/file
dnf check-update
rpm -qf /path/to/file
pacman -Syu
zypper update
```

## Archivi, checksum e trasferimenti

```bash
tar -czf archive.tar.gz directory
tar -tf archive.tar.gz
sha256sum file
rsync -aHAX --dry-run source/ destination/
scp file user@host:/path/
sftp user@host
```

## Container

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker logs --tail 100 container
docker inspect container
podman ps
nsenter -t PID -m -u -i -n -p
```

## Diagnostica kernel

```bash
dmesg -T | tail -100
uname -a
lsmod
modinfo module
sysctl -a
ulimit -a
```

## Collegamenti

- [[01_Informatica/Linux/Comandi Linux|Comandi Linux]]
- [[01_Informatica/Linux/Fondamenti e amministrazione Linux|Amministrazione Linux]]
- [[Ricerca testo Regex jq sed awk e ripgrep]]
