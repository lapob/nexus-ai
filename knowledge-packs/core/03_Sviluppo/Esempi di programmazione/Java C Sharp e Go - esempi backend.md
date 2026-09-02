---
title: Java C Sharp e Go - esempi backend
type: reference
area: development
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [java, csharp, go, backend, examples]
aliases: [Esempi Java, Esempi C Sharp, Esempi Go]
---

# Java C Sharp e Go - esempi backend

## Sintesi

Lo stesso dominio: validare un evento e contare i livelli.

## Java

```java
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

record Event(Instant timestamp, String level, String message) {
    Event {
        level = level.trim().toUpperCase();
        message = message.trim();
        if (!List.of("INFO", "WARNING", "ERROR").contains(level)) {
            throw new IllegalArgumentException("invalid level");
        }
        if (message.isEmpty()) {
            throw new IllegalArgumentException("message is required");
        }
    }
}

final class EventOperations {
    static Map<String, Long> countByLevel(List<Event> events) {
        return events.stream()
            .collect(Collectors.groupingBy(Event::level, Collectors.counting()));
    }
}
```

Usa try-with-resources per stream/file e valida JSON con uno schema o DTO esplicito.

## C# e .NET

```csharp
using System.Collections.Generic;
using System.Linq;

public sealed record Event(DateTimeOffset Timestamp, string Level, string Message);

public static class EventOperations
{
    public static Event Validate(Event value)
    {
        var level = value.Level.Trim().ToUpperInvariant();
        var message = value.Message.Trim();
        if (level is not ("INFO" or "WARNING" or "ERROR"))
            throw new ArgumentException("Invalid level");
        if (message.Length == 0)
            throw new ArgumentException("Message is required");
        return value with { Level = level, Message = message };
    }

    public static IReadOnlyDictionary<string, int> CountByLevel(
        IEnumerable<Event> events
    ) =>
        events
            .GroupBy(item => item.Level)
            .ToDictionary(group => group.Key, group => group.Count());
}
```

Per operazioni asincrone propaga `CancellationToken` e non bloccare con `.Result`.

## Go

```go
package events

import (
    "errors"
    "strings"
    "time"
)

type Event struct {
    Timestamp time.Time `json:"timestamp"`
    Level     string    `json:"level"`
    Message   string    `json:"message"`
}

func Validate(value Event) (Event, error) {
    value.Level = strings.ToUpper(strings.TrimSpace(value.Level))
    value.Message = strings.TrimSpace(value.Message)
    switch value.Level {
    case "INFO", "WARNING", "ERROR":
    default:
        return Event{}, errors.New("invalid level")
    }
    if value.Message == "" {
        return Event{}, errors.New("message is required")
    }
    return value, nil
}

func CountByLevel(events []Event) map[string]int {
    counts := make(map[string]int)
    for _, event := range events {
        counts[event.Level]++
    }
    return counts
}
```

Propaga `context.Context` nelle chiamate I/O, imposta timeout e chiudi sempre i body HTTP.

## Confronto backend

| Tema | Java | C# | Go |
|---|---|---|---|
| runtime | JVM | .NET | binario nativo |
| asincronia | virtual thread/future | async/await | goroutine/channel |
| errori | exception | exception/result pattern | valore `error` |
| web | Spring/Quarkus | ASP.NET Core | `net/http` + framework |
| deployment | JAR/container | app/container | binario/container |

## Gate

Implementa una piccola API in uno dei tre linguaggi con:

- schema request/response;
- validazione;
- timeout e cancellazione;
- storage parametrizzato;
- test di handler e integrazione;
- correlation ID e log senza segreti.

## Collegamenti

- [[Indice - Esempi di programmazione]]
- [[03_Sviluppo/Linguaggi/Java e Kotlin|Java e Kotlin]]
- [[03_Sviluppo/Linguaggi/C Sharp e dotNET|C# e .NET]]
- [[03_Sviluppo/Linguaggi/Go|Go]]
