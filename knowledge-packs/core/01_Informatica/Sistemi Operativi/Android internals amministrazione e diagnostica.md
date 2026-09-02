---
title: Android internals, amministrazione e diagnostica
type: technical-guide
area: operating-systems
status: evergreen
level: advanced
visibility: public
created: 2026-08-08
updated: 2026-08-08
source_kind: curated
tags: [android, internals, adb, diagnostics, security]
aliases: [Android internals e diagnostica]
---

# Android internals, amministrazione e diagnostica

Android combina kernel Linux, Hardware Abstraction Layer, servizi nativi, Android Runtime, framework Java/Kotlin e applicazioni isolate. Ogni app riceve normalmente un UID distinto; permission, SELinux, sandbox, firma e componenti IPC compongono il confine di sicurezza. Il root di un dispositivo personale non equivale all’autorizzazione a esaminare app o dati di terzi.

## Modello del sistema

| Strato | Componenti | Domanda diagnostica |
|---|---|---|
| boot | bootloader, verified boot, partizioni A/B | la catena e lo slot sono integri? |
| kernel | processi, memoria, driver, cgroup, SELinux | quale risorsa o policy blocca l’operazione? |
| native | init, linker, Bionic, HAL, daemon | quale servizio espone la capability? |
| runtime | ART, Zygote, garbage collector | il problema è avvio, memoria o compilazione? |
| framework | ActivityManager, PackageManager, Binder | quale lifecycle, package o transazione fallisce? |
| app | activity, service, receiver, provider | quale componente e identità sono coinvolti? |

## Inventario non invasivo

Esegui questi comandi solo su emulatori o dispositivi propri/autorizzati. `adb` mostra sempre il seriale prima di operazioni che modificano lo stato.

```bash
adb devices -l
adb -s SERIAL shell getprop ro.build.version.release
adb -s SERIAL shell getprop ro.build.version.security_patch
adb -s SERIAL shell uname -a
adb -s SERIAL shell id
adb -s SERIAL shell pm list packages -3
adb -s SERIAL shell dumpsys battery
adb -s SERIAL shell df -h
```

## Processo, package e lifecycle

```bash
adb -s SERIAL shell pm path com.example.app
adb -s SERIAL shell dumpsys package com.example.app
adb -s SERIAL shell pidof com.example.app
adb -s SERIAL shell ps -A -o USER,PID,PPID,NAME
adb -s SERIAL shell dumpsys activity activities
adb -s SERIAL shell dumpsys meminfo com.example.app
```

`dumpsys package` collega versione, firma, permission e componenti; `activity` mostra task e lifecycle; `meminfo` separa heap, codice, grafica e memoria nativa. Confronta sempre uno stato sano con quello difettoso.

## Log e performance

```bash
adb -s SERIAL logcat -c
adb -s SERIAL logcat --pid=$(adb -s SERIAL shell pidof -s com.example.app)
adb -s SERIAL shell dumpsys cpuinfo
adb -s SERIAL shell dumpsys gfxinfo com.example.app framestats
adb -s SERIAL shell am force-stop com.example.app
adb -s SERIAL shell am start -W com.example.app/.MainActivity
```

Filtra i log per PID e finestra temporale; prima di condividerli rimuovi token, identificativi e dati personali. `force-stop` altera lo stato: usalo in un test riproducibile, non durante un incidente senza annotarlo.

## Rete e connettività

```bash
adb -s SERIAL shell ip addr
adb -s SERIAL shell ip route
adb -s SERIAL shell dumpsys connectivity
adb -s SERIAL shell dumpsys wifi
adb -s SERIAL shell settings get global private_dns_mode
```

Diagnostica in ordine: interfaccia, indirizzo, route, DNS, trasporto, TLS, API. Proxy, VPN e Private DNS possono modificare percorsi differenti. Il traffico di un’app non è necessariamente osservabile senza una build di test configurata per il certificato del laboratorio.

## Storage, backup e dati

Scoped Storage limita l’accesso ai file; Keystore protegge materiale crittografico mediante chiavi non esportabili quando l’hardware lo consente. Non confondere cifratura del dispositivo con autorizzazione applicativa. Verifica classificazione, retention, backup, log, cache, screenshot e clipboard.

```bash
adb -s SERIAL shell run-as com.example.debug ls -la files
adb -s SERIAL shell content query --uri content://settings/system
```

`run-as` funziona soltanto per package debuggable e autorizzati. Non tentare bypass su build di terzi.

## Aggiornamenti, firma e recovery

Prima di aggiornare registra build, patch level, spazio, batteria e backup. Sui dispositivi A/B l’aggiornamento prepara lo slot inattivo e cambia slot al riavvio; rollback protection impedisce downgrade non sicuri. Sideload, sblocco bootloader e factory reset possono cancellare dati o ridurre le garanzie di sicurezza: richiedono procedura del produttore e consenso esplicito.

## Checklist di hardening personale o aziendale

- patch level supportato e boot verificato;
- blocco schermo robusto, cifratura e recovery gestita;
- installazione da fonti amministrate;
- permission e accessibility service revisionati;
- USB debugging disattivato fuori dal laboratorio;
- profilo di lavoro o gestione enterprise coerente con la privacy;
- backup e remote wipe provati secondo policy;
- app obsolete, certificati utente e VPN inventariati.

## Laboratorio sicuro

1. crea un emulatore senza dati personali;
2. installa una tua build debug;
3. acquisisci baseline di package, memoria, rete e log;
4. provoca rotazione, perdita rete, low-memory e aggiornamento schema;
5. correla sintomo, log e lifecycle;
6. ripristina snapshot e redigi il runbook.

## Collegamenti

- [[Panoramica Windows Linux macOS BSD e sistemi mobili]]
- [[03_Sviluppo/Mobile/Android Kotlin architettura build e debugging|Sviluppo Android]]
- [[02_Cybersecurity/Wireless Mobile e IoT/Sicurezza mobile Android e iOS|Sicurezza mobile]]
- [[05_Risorse/Metodo professionale per comandi procedure e troubleshooting|Metodo professionale]]
