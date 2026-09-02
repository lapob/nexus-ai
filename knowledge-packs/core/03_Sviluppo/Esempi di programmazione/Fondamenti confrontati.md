---
title: Fondamenti confrontati
type: reference
area: development
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [programming, comparison, fundamentals]
aliases: [Rosetta code personale]
---

# Fondamenti confrontati

## La stessa funzione

Obiettivo: normalizzare una stringa e rifiutare input vuoto.

### Python

```python
def normalize_name(value: str) -> str:
    result = value.strip()
    if not result:
        raise ValueError("name is required")
    return result.casefold()
```

### TypeScript

```typescript
function normalizeName(value: string): string {
  const result = value.trim();
  if (!result) throw new Error("name is required");
  return result.toLocaleLowerCase();
}
```

### Go

```go
func normalizeName(value string) (string, error) {
    result := strings.TrimSpace(value)
    if result == "" {
        return "", errors.New("name is required")
    }
    return strings.ToLower(result), nil
}
```

### Rust

```rust
fn normalize_name(value: &str) -> Result<String, &'static str> {
    let result = value.trim();
    if result.is_empty() {
        return Err("name is required");
    }
    Ok(result.to_lowercase())
}
```

## Trasformare una collezione

### Python

```python
active_names = [
    user["name"]
    for user in users
    if user["active"]
]
```

### TypeScript

```typescript
const activeNames = users
  .filter((user) => user.active)
  .map((user) => user.name);
```

### C#

```csharp
var activeNames = users
    .Where(user => user.Active)
    .Select(user => user.Name)
    .ToList();
```

## Concetti equivalenti

| Concetto | Python | TypeScript | Java/C# | Go | Rust |
|---|---|---|---|---|---|
| valore assente | `None` | `undefined/null` | `null`/optional | zero value/pointer | `Option<T>` |
| errore | exception | exception/result custom | exception | `error` | `Result<T,E>` |
| collezione dinamica | `list` | `Array` | `List` | slice | `Vec<T>` |
| mappa | `dict` | `Map`/object | `Map`/`Dictionary` | `map` | `HashMap` |
| asincronia | `asyncio` | Promise | Future/Task | goroutine/channel | Future/Tokio |
| gestione risorsa | context manager | `try/finally` | try-with/`using` | `defer` | ownership/Drop |

## Domande da saper rispondere

- il tipo impedisce lo stato invalido o lo scopri a runtime?
- chi possiede la risorsa e quando viene chiusa?
- l'errore contiene contesto senza esporre dati?
- l'operazione è sincrona, asincrona o concorrente?
- l'input attraversa un trust boundary?

## Collegamenti

- [[Indice - Esempi di programmazione]]
- [[03_Sviluppo/Linguaggi/Fondamenti di programmazione|Fondamenti di programmazione]]
