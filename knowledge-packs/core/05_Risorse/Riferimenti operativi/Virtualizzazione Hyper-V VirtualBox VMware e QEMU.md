---
title: Virtualizzazione: Hyper-V, VirtualBox, VMware e QEMU
type: reference
area: virtualization
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: official-docs
tags: [virtualization, hyper-v, virtualbox, qemu]
aliases: [Comandi virtualizzazione]
---

# Virtualizzazione: Hyper-V, VirtualBox, VMware e QEMU

> Verificare nome VM, dischi e backup prima di snapshot, restore o conversioni.

## Hyper-V

```powershell
Get-VM
Get-VMHost
Get-VMSwitch
Start-VM -Name 'Lab'
Stop-VM -Name 'Lab' -Shutdown
Checkpoint-VM -Name 'Lab' -SnapshotName 'prima-del-test'
Get-VMSnapshot -VMName 'Lab'
Restore-VMSnapshot -VMName 'Lab' -Name 'prima-del-test' -Confirm
Export-VM -Name 'Lab' -Path 'D:\VM-Export'
Get-VMNetworkAdapter -VMName 'Lab'
Get-VHD -Path 'D:\VM\disk.vhdx'
```

## VirtualBox

```powershell
VBoxManage list vms
VBoxManage list runningvms
VBoxManage showvminfo "Lab"
VBoxManage startvm "Lab" --type headless
VBoxManage controlvm "Lab" acpipowerbutton
VBoxManage snapshot "Lab" take "prima-del-test"
VBoxManage snapshot "Lab" list
VBoxManage snapshot "Lab" restore "prima-del-test"
VBoxManage export "Lab" --output "Lab.ova"
```

## QEMU

```bash
qemu-img info disk.qcow2
qemu-img create -f qcow2 disk.qcow2 60G
qemu-img convert -p -O qcow2 source.vmdk disk.qcow2
qemu-img snapshot -l disk.qcow2
qemu-system-x86_64 -enable-kvm -m 4096 -smp 4 -drive file=disk.qcow2,if=virtio
```

Bridged espone la VM alla LAN; NAT la nasconde; host-only collega host e VM;
internal collega solo VM. Per malware analysis usare rete isolata, snapshot
pulito e nessuna cartella condivisa.
