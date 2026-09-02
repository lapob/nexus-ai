---
title: Apple: Swift, SwiftUI, iOS e macOS
type: programming-guide
area: apple-development
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [swift, swiftui, ios, macos, examples]
aliases: [Swift e SwiftUI]
---

# Apple: Swift, SwiftUI, iOS e macOS

## Tooling

```bash
swift --version
swift package init --type executable
swift build
swift test
xcodebuild -list
xcodebuild -scheme App -configuration Debug build
xcrun simctl list devices
```

## Swift moderno

```swift
struct Device: Codable, Identifiable, Sendable {
    let id: UUID
    let name: String
    let online: Bool
}

actor DeviceStore {
    private var devices: [Device] = []

    func replace(with values: [Device]) {
        devices = values
    }

    func snapshot() -> [Device] { devices }
}
```

Preferisci value type, optionals espliciti, `async/await`, actor per stato condiviso e protocolli per dipendenze testabili.

## SwiftUI

```swift
struct DeviceRow: View {
    let device: Device

    var body: some View {
        Label(device.name, systemImage: device.online ? "checkmark.circle" : "circle")
            .accessibilityValue(device.online ? "Online" : "Offline")
    }
}
```

Mantieni side effect fuori da `body`, usa stato con ownership chiara e supporta Dynamic Type, VoiceOver, contrasto e Reduce Motion.

## Sicurezza e distribuzione

Usa Keychain per segreti, App Transport Security, entitlement minimi, sandbox e data protection. Comprendi bundle ID, provisioning profile, certificati, firma, notarizzazione macOS e privacy manifest. Non aggirare la verifica firma per risolvere errori di build.

## Collegamenti

- [[Indice - Mobile Development]]
- [[02_Cybersecurity/Wireless Mobile e IoT/Sicurezza mobile Android e iOS|Sicurezza mobile]]
