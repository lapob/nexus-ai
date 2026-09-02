---
title: Comandi Linux
type: reference
area: tech
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: curated
tags: [nexus, tech]
aliases: []
---

# Comandi Linux

## Sintesi

Raccolta professionale dei comandi Linux piu usati per navigazione, gestione file, processi, servizi, rete e pacchetti.

## Collegamenti Correlati

- [[01_Informatica/Linux/Fondamenti e amministrazione Linux]]
- [[01_Informatica/Bash/Bash per automazione|Bash per automazione]]
- [[01_Informatica/Networking/Comandi Networking - Tech|Networking Commands]]
- [[05_Risorse/Catalogo dei comandi|Catalogo dei comandi]]

## Concetti Chiave

- Linux espone quasi tutto come file: directory, device, configurazioni e log.
- I comandi possono essere combinati con pipe, redirect e opzioni.
- Prima di usare comandi distruttivi, controllare sempre percorso e target.
- Le operazioni amministrative richiedono spesso `sudo`.

## Navigazione

```bash
pwd                  # mostra la directory corrente
ls                   # lista file e cartelle
ls -la               # lista dettagliata, inclusi file nascosti
cd /percorso         # cambia directory
cd ..                # sale di una directory
tree                 # mostra la struttura ad albero
```

## File e Cartelle

```bash
touch file.txt
mkdir nuova-cartella
mkdir -p lab/linux/base
cp file.txt copia.txt
cp -r cartella backup-cartella
mv vecchio.txt nuovo.txt
rm file.txt
rmdir cartella-vuota
```

## Visualizzazione File

```bash
cat file.txt
less file.txt
head file.txt
head -n 20 file.txt
tail file.txt
tail -f /var/log/syslog
```

## Ricerca

```bash
find . -name "*.txt"
find /etc -type f -name "*.conf"
grep "testo" file.txt
grep -R "pattern" .
grep -RIn --exclude-dir=.git "pattern" .
which bash
command -v bash
locate nome-file
```

## Testo, Pipe e Redirect

```bash
comando > output.txt
comando >> output.txt
comando 2> errori.txt
comando | less
sort file.txt | uniq -c
cut -d: -f1 /etc/passwd
awk -F: '{print $1}' /etc/passwd
sed -n '1,20p' file.txt
```

Non costruire comandi con input non fidato. Per nomi file arbitrari usa quoting e separatori NUL.

## Permessi e Proprietari

```bash
ls -l
chmod +x script.sh
chmod 755 script.sh
chmod 644 file.txt
sudo chown user:group file.txt
id
groups
umask
getfacl file.txt
```

## Processi

```bash
ps aux
top
htop
kill PID
kill -9 PID
pkill nome-processo
pgrep -af nome-processo
nice -n 10 comando
lsof -p PID
```

Invia prima `TERM`; usa `KILL` soltanto quando il processo non può chiudersi correttamente.

## Servizi

```bash
systemctl status nome-servizio
sudo systemctl start nome-servizio
sudo systemctl stop nome-servizio
sudo systemctl restart nome-servizio
sudo systemctl enable nome-servizio
journalctl -u nome-servizio
journalctl -u nome-servizio --since today
journalctl -p warning
```

## Rete

```bash
ip a
ip route
ping -c 4 8.8.8.8
traceroute example.com
ss -tulpn
netstat -tulpn
```

## Pacchetti APT

```bash
sudo apt update
sudo apt upgrade
sudo apt install nome-pacchetto
sudo apt remove nome-pacchetto
apt search termine
apt show nome-pacchetto
```

## Disco e Spazio

```bash
df -h
du -sh *
lsblk
mount
findmnt
du -ah . | sort -h | tail
```

## Archivi e Compressione

```bash
tar -czf archivio.tar.gz cartella/
tar -tzf archivio.tar.gz
tar -xzf archivio.tar.gz -C destinazione/
gzip file
gunzip file.gz
zip -r archivio.zip cartella/
unzip -l archivio.zip
```

Elenca il contenuto prima di estrarre archivi non fidati e usa una directory isolata.

## Ambiente e Shell

```bash
env
printenv PATH
export NOME=valore
alias
type comando
history
```

Non inserire token e password nella history o negli alias.

## Sistema

```bash
uname -a
hostnamectl
whoami
uptime
date
history
lsmod
sysctl -a
dmesg --level=err,warn
```

## Spegnimento e Riavvio

```bash
sudo shutdown now
sudo reboot
sudo poweroff
```

## Indicazioni operative

- Usare questa nota come riferimento rapido.
- Per spiegazioni dettagliate, collegare ogni comando alla nota tematica corrispondente.
