---
title: Swift
type: language
area: development
status: verified
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: curated
tags: [programming, swift, apple]
aliases: []
language: swift
verified_at: 2026-08-08
review_after: 2027-02-08
---

# Swift

## Sintesi

Value/reference type, optional, enum e pattern matching, protocol, generics, closure, ARC, error handling, async/await e actor. Per app Apple: SwiftUI/UIKit, lifecycle, networking, persistenza, test, accessibilità e Keychain per segreti.

## Esempio verificabile

```swift
actor Counter {
    private var value = 0
    func increment() { value += 1 }
    func current() -> Int { value }
}
```

Gli actor serializzano l'accesso allo stato isolato; non rendono automaticamente atomiche operazioni distribuite su più actor o risorse esterne.

## Fonti primarie

- Swift documentation: https://www.swift.org/documentation/
- The Swift Programming Language: https://docs.swift.org/swift-book/documentation/the-swift-programming-language/
- API Design Guidelines: https://www.swift.org/documentation/api-design-guidelines/
