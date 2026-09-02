---
title: Kernel, browser sandbox, firmware, TPM e confidential computing
type: reference
area: systems
status: evergreen
level: advanced
visibility: public
created: 2026-08-08
updated: 2026-08-08
source_kind: official-docs
tags: [kernel, browser, sandbox, uefi, tpm, confidential-computing]
aliases: [Confini di isolamento hardware e sistema]
---

# Kernel, browser sandbox, firmware, TPM e confidential computing

## Catena di fiducia

`firmware → Secure Boot → bootloader → kernel → hypervisor/VBS → processo → sandbox applicativa`

Ogni livello verifica o confina il successivo, ma non sostituisce patching, configurazione e controllo delle identità. Il TPM protegge chiavi e misure; non certifica da solo che un'applicazione sia priva di vulnerabilità.

## Browser multiprocesso

Il browser separa processo principale, renderer, GPU, rete e utility. Site isolation e sandbox riducono l'impatto di una compromissione del renderer. IPC, broker, parser nativi, driver GPU ed estensioni costituiscono confini ad alto valore.

## Firmware e avvio

UEFI conserva configurazione e variabili di boot; Secure Boot verifica firme nella catena di avvio. Aggiornamenti firmware interrotti, chiavi non gestite, fallback legacy e DMA pre-boot sono failure mode distinti.

## Confidential computing

TEE e confidential VM mirano a proteggere dati in uso da host o hypervisor non pienamente fidati. Remote attestation lega misure, identità della piattaforma e policy. Side channel, disponibilità e supply chain restano fuori dalla garanzia principale.

## Diagnostica

- stato Secure Boot e TPM, versione firmware e log eventi;
- code integrity, VBS/HVCI e policy applicate;
- process tree, token, integrity level e sandbox policy;
- report di crash separati per renderer, GPU e broker;
- quote e certificati di attestation con nonce e freshness.

## Fonti primarie

- Microsoft TPM fundamentals: https://learn.microsoft.com/windows/security/hardware-security/tpm/trusted-platform-module-overview
- Chromium sandbox: https://chromium.googlesource.com/chromium/src/+/main/docs/design/sandbox.md
- UEFI specifications: https://uefi.org/specifications
- Confidential Computing Consortium: https://confidentialcomputing.io/
