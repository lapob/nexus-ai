---
title: Hardware PC, firmware, UEFI, storage e diagnostica
type: technical-guide
area: hardware
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [hardware, pc, uefi, firmware, storage, diagnostics]
aliases: [Diagnostica hardware PC]
---

# Hardware PC, firmware, UEFI, storage e diagnostica

## Componenti

- CPU: core, thread, cache, ISA, frequenza, power limit;
- RAM: capacità, canali, timing, ECC e stabilità;
- motherboard: chipset, VRM, bus, firmware;
- GPU: compute, VRAM, encoder e driver;
- storage: SATA/NVMe, NAND, controller, cache e endurance;
- alimentazione: qualità, potenza, rail e protezioni;
- raffreddamento: dissipazione, airflow, sensori e throttling.

## UEFI e boot

UEFI inizializza hardware, espone servizi firmware e carica un bootloader dalla EFI System Partition. Secure Boot verifica la catena di firma; TPM protegge misure e chiavi.

Prima di aggiornare firmware:

1. identifica modello e revisione esatti;
2. leggi note e prerequisiti;
3. salva configurazione e recovery key;
4. usa alimentazione stabile;
5. non interrompere il processo;
6. verifica versione e impostazioni dopo il riavvio.

## Diagnostica

Procedi da sintomo a componente, evitando sostituzioni casuali.

| Sintomo | Controlli iniziali |
|---|---|
| nessun POST | alimentazione, debug LED, RAM, CPU, clear CMOS documentato |
| crash sotto carico | temperatura, PSU, RAM, driver, log WHEA |
| storage lento | spazio, temperatura, SMART, link mode, firmware |
| throttling | temperature, clock, power limit, airflow |
| periferica instabile | porta, cavo, alimentazione, driver, event log |

```powershell
Get-CimInstance Win32_Processor
Get-CimInstance Win32_PhysicalMemory
Get-PhysicalDisk | Select-Object FriendlyName,HealthStatus,MediaType,Size
Get-WinEvent -ProviderName Microsoft-Windows-WHEA-Logger -MaxEvents 20
```

```bash
lscpu
lsmem
lspci -nnk
lsusb -t
smartctl -a /dev/device
nvme smart-log /dev/nvme0
sensors
```

## Storage e dati

SMART indica attributi e errori, non garantisce che il disco non fallirà. Prima di benchmark o firmware verifica backup. Distinguere filesystem corruption, media error, controller, cavo e power loss.

## Stabilità

Stress test controllati isolano CPU, RAM, GPU e storage. Monitora temperature ed errori; interrompi se superano limiti sicuri. Un test superato riduce la probabilità di errore ma non prova stabilità assoluta.

## Sicurezza firmware

Mantieni firmware supportato, Secure Boot, TPM e password UEFI dove appropriato. Proteggi boot esterno e recovery; conserva chiavi di ripristino fuori dal dispositivo.

## Collegamenti

- [[Fondamenti embedded firmware e protocolli hardware]]
- [[01_Informatica/Computer Science/Architettura dei calcolatori e rappresentazione dei dati|Architettura dei calcolatori]]
- [[01_Informatica/Sistemi operativi e virtualizzazione|Virtualizzazione]]
