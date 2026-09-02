---
title: Panoramica Windows, Linux, macOS, BSD e sistemi mobili
type: technical-guide
area: operating-systems
status: evergreen
level: foundation
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [windows, linux, macos, bsd, android, ios]
aliases: [Atlante sistemi operativi]
---

# Panoramica Windows, Linux, macOS, BSD e sistemi mobili

## Modello comune

Ogni sistema gestisce CPU, memoria, periferiche, filesystem, identità, isolamento, rete e interfacce applicative. Le differenze principali sono kernel, userland, formato dei pacchetti, modello di servizio, policy di sicurezza e compatibilità.

| Famiglia | Kernel e userland | Gestione software | Servizi e log |
|---|---|---|---|
| Windows | NT, Win32/.NET/PowerShell | Store, MSI/MSIX, package manager | Service Control Manager, Event Log |
| GNU/Linux | kernel Linux + distribuzione | apt, dnf, pacman, zypper | systemd/OpenRC, journald/syslog |
| macOS | XNU + Darwin | App Store, pkg, Homebrew opzionale | launchd, unified logging |
| FreeBSD/OpenBSD | kernel e userland integrati | pkg e ports | rc, syslog |
| Android | Linux + Android Runtime | Play/APK/AAB | init, logcat |
| iOS/iPadOS | XNU + framework Apple | App Store e provisioning | unified logging, sandbox |

## Scelta

Windows eccelle nell’ecosistema desktop aziendale e Active Directory; Linux nei server, cloud, embedded e automazione; macOS nello sviluppo Apple e workflow creativi; BSD in sistemi coerenti, networking e appliance; Android e iOS sono piattaforme mobili con sandbox, firma e lifecycle restrittivi.

## Baseline operativa

Per ogni piattaforma impara: avvio e recovery, account e privilegi, permessi, processi, servizi, pacchetti, rete, log, storage, aggiornamenti, backup e strumenti di diagnostica. Non memorizzare soltanto comandi: associa prerequisiti, output atteso, effetto, rischio e rollback.

## Sicurezza

Mantieni supporto e patch, limita privilegi, cifra i dati, usa boot verificato dove disponibile, proteggi recovery e backup, registra gli accessi e rimuovi servizi inutili. Su dispositivi mobili considera MDM, separazione lavoro/personale, permessi applicativi e provenienza delle app.

## Collegamenti

- [[Indice - Sistemi Operativi]]
- [[02_Cybersecurity/Fondamenti/Modello operativo della sicurezza|Modello operativo della sicurezza]]
