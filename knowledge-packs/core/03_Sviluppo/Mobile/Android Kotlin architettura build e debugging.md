---
title: Android e Kotlin: architettura, build e debugging
type: programming-guide
area: android
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [android, kotlin, gradle, examples]
aliases: [Android e Kotlin]
---

# Android e Kotlin: architettura, build e debugging

## Comandi

```bash
./gradlew tasks
./gradlew test
./gradlew lint
./gradlew assembleDebug
./gradlew bundleRelease
adb devices
adb install app-debug.apk
adb shell pm list packages
adb logcat --pid=$(adb shell pidof -s package.name)
adb shell dumpsys package package.name
```

## Kotlin con coroutine

```kotlin
data class Device(val id: String, val online: Boolean)

interface DeviceRepository {
    suspend fun load(): Result<List<Device>>
}

class LoadDevices(private val repository: DeviceRepository) {
    suspend operator fun invoke(): List<Device> =
        repository.load().getOrElse { emptyList() }
}
```

Usa structured concurrency, dispatcher adeguati e lifecycle-aware collection. Non conservare riferimenti ad Activity o View in singleton.

## Architettura

UI Compose/View → ViewModel → use case → repository → data source. Mantieni modelli di rete separati dal dominio, gestisci migrazioni Room e usa WorkManager per lavoro differibile garantito.

## Sicurezza e rilascio

Minimizza permission, usa Network Security Configuration, Keystore, App Links verificati e componenti non esportati per default. Non loggare token o dati personali. Firma le release, proteggi la signing key e verifica dipendenze e manifest risultante.

## Collegamenti

- [[Indice - Mobile Development]]
- [[02_Cybersecurity/Wireless Mobile e IoT/Sicurezza mobile Android e iOS|Sicurezza mobile]]
