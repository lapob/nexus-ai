---
title: Kotlin PHP Ruby e Swift - esempi rapidi
type: reference
area: development
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [kotlin, php, ruby, swift, examples]
aliases: [Esempi Kotlin, Esempi PHP, Esempi Ruby, Esempi Swift]
---

# Kotlin PHP Ruby e Swift - esempi rapidi

## Kotlin

```kotlin
import java.time.Instant

data class Event(
    val timestamp: Instant,
    val level: String,
    val message: String,
)

fun validate(event: Event): Event {
    val level = event.level.trim().uppercase()
    require(level in setOf("INFO", "WARNING", "ERROR")) {
        "invalid level"
    }
    require(event.message.isNotBlank()) {
        "message is required"
    }
    return event.copy(level = level, message = event.message.trim())
}
```

Usa nullable types espliciti, coroutine strutturate e timeout sulle operazioni I/O.

## PHP con PDO parametrizzato

```php
<?php
declare(strict_types=1);

$statement = $pdo->prepare(
    'SELECT id, email FROM users WHERE email = :email LIMIT 1'
);
$statement->execute(['email' => $email]);
$user = $statement->fetch(PDO::FETCH_ASSOC);
```

Valida l'input, usa query preparate, output encoding contestuale e configurazione dei segreti esterna al web root.

## Ruby

```ruby
Event = Data.define(:timestamp, :level, :message)

def count_by_level(events)
  events.each_with_object(Hash.new(0)) do |event, counts|
    level = event.level.to_s.strip.upcase
    raise ArgumentError, "invalid level" unless %w[INFO WARNING ERROR].include?(level)

    counts[level] += 1
  end
end
```

Usa keyword arguments, test, Bundler/lockfile e query parametrizzate nell'ORM.

## Swift

```swift
import Foundation

enum Level: String, Codable {
    case info = "INFO"
    case warning = "WARNING"
    case error = "ERROR"
}

enum ValidationError: Error {
    case emptyMessage
}

struct Event: Codable {
    let timestamp: Date
    let level: Level
    let message: String
}

func validated(_ event: Event) throws -> Event {
    guard !event.message.trimmingCharacters(in: .whitespaces).isEmpty else {
        throw ValidationError.emptyMessage
    }
    return event
}
```

Usa `Codable`, optionals, errori tipizzati e actor/async-await per concorrenza sicura.

## Collegamenti

- [[Indice - Esempi di programmazione]]
- [[03_Sviluppo/Linguaggi/Java e Kotlin|Java e Kotlin]]
- [[03_Sviluppo/Linguaggi/PHP e Ruby|PHP e Ruby]]
- [[03_Sviluppo/Linguaggi/Swift|Swift]]
