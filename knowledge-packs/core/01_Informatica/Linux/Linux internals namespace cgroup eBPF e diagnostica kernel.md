---
title: Linux internals: namespace, cgroup, eBPF e diagnostica kernel
type: technical-guide
area: linux
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [linux, kernel, namespaces, cgroups, ebpf, diagnostics]
aliases: [Linux internals]
---

# Linux internals: namespace, cgroup, eBPF e diagnostica kernel

## Modello mentale

Il kernel gestisce processi, memoria virtuale, scheduler, filesystem, rete, driver e sicurezza. Lo user space interagisce tramite syscall; libc, runtime e shell aggiungono astrazioni.

Un processo possiede PID, credenziali, namespace, cgroup, descrittori, mapping di memoria, capability e contesto di sicurezza. Un container non è una VM: è un insieme di processi isolati tramite primitive del kernel.

## Processi e syscall

```bash
ps -eo pid,ppid,user,stat,ni,psr,%cpu,%mem,cmd --forest
cat /proc/PID/status
cat /proc/PID/maps
ls -l /proc/PID/fd
strace -f -tt -T -p PID
perf stat -p PID
```

`strace` mostra syscall ma aggiunge overhead. `perf` usa contatori e sampling; richiede simboli per stack leggibili.

## Namespace

Tipi principali: mount, PID, network, IPC, UTS, user, cgroup e time.

```bash
lsns
readlink /proc/PID/ns/net
nsenter -t PID -m -u -i -n -p
unshare --user --map-root-user --mount --pid --fork /bin/bash
```

User namespace e capability vanno valutati insieme. Essere `root` dentro un namespace non equivale necessariamente a root sull’host.

## Cgroup v2

I cgroup organizzano e limitano CPU, memoria, I/O e numero di processi.

```bash
mount | grep cgroup2
systemd-cgls
systemd-cgtop
cat /proc/PID/cgroup
cat /sys/fs/cgroup/system.slice/service.service/memory.current
```

Una memoria limitata può causare OOM kill anche se l’host ha RAM libera. Correlare `memory.events`, log kernel e limiti del servizio.

## Memoria

```bash
free -h
vmstat 1
cat /proc/meminfo
smem -tk
slabtop
cat /proc/pressure/memory
```

RSS, virtual size, page cache e commit misurano proprietà differenti. PSI indica pressione percepita dai workload.

## eBPF

eBPF esegue programmi verificati nel kernel per networking, tracing e sicurezza. Strumenti BCC/bpftrace:

```bash
bpftrace -l 'tracepoint:syscalls:sys_enter_*'
bpftrace -e 'tracepoint:syscalls:sys_enter_execve { @[comm] = count(); }'
```

In produzione usa script revisionati, filtri stretti e durata limitata. Una probe ad alta frequenza può produrre overhead e dati sensibili.

## Kernel e boot

```bash
journalctl -k -b
dmesg -T
uname -a
lsmod
modinfo module
sysctl key
cat /proc/cmdline
systemd-analyze critical-chain
```

## Sicurezza

Capability minime, seccomp, SELinux/AppArmor, mount read-only, `no_new_privs`, kernel aggiornato, moduli firmati dove previsto e accesso ristretto a tracing/debug.

## Scenario tecnico
Avvia un processo con limite memoria, osserva cgroup e PSI, genera carico controllato, identifica l’evento OOM e documenta differenza tra memoria host e limite locale.

## Collegamenti

- [[Fondamenti e amministrazione Linux]]
- [[05_Risorse/Riferimenti operativi/Comandi Linux riferimento completo|Comandi Linux riferimento completo]]
- [[02_Cybersecurity/Cloud Container e DevSecOps/Baseline Kubernetes e supply chain|Container security]]
