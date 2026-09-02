---
title: Sicurezza mobile Android e iOS
type: security-guide
area: mobile-security
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [android, ios, mobile-security, assessment]
aliases: [Mobile security]
---

# Sicurezza mobile Android e iOS

## Superficie

Pacchetto e firma, componenti esportati, deep link, WebView, storage, log, clipboard, backup, IPC, permission, biometria, crittografia, rete, aggiornamenti e API backend.

## Workflow autorizzato

1. raccogli build, ambiente e account di test;
2. esamina manifest, entitlement, permission e dipendenze;
3. mappa dati sensibili e trust boundary;
4. verifica storage e log su emulator/simulator o device dedicato;
5. osserva traffico tramite proxy autorizzato;
6. testa autenticazione, sessione e autorizzazione anche sul backend;
7. verifica resilienza a lifecycle, offline, retry e device compromesso;
8. documenta evidenza minima, cleanup e retest.

## Android

```bash
adb shell dumpsys package package.name
adb shell am start -W -a android.intent.action.VIEW -d 'https://example.test/path'
adb logcat --pid=$(adb shell pidof -s package.name)
apkanalyzer manifest print app.apk
```

Controlla `exported`, intent filter, provider, backup, Network Security Configuration, Keystore e WebView.

## Apple

```bash
codesign -d --entitlements :- App.app
security cms -D -i App.app/embedded.mobileprovision
xcrun simctl list
log stream --predicate 'process == "App"'
```

Controlla entitlement, Keychain accessibility, URL scheme/universal link, ATS, data protection e privacy manifest.

## Difese

Minimizza dati e permission, usa storage protetto, authz backend, certificate validation corretta, logging sanificato, aggiornamenti firmati e rilevamento del rischio senza considerarlo un confine assoluto.

## Collegamenti

- [[Assessment wireless e IoT autorizzato]]
- [[03_Sviluppo/Mobile/Indice - Mobile Development|Mobile Development]]
- [[02_Cybersecurity/Application Security/Secure SDLC e OWASP 2025|Secure SDLC]]
