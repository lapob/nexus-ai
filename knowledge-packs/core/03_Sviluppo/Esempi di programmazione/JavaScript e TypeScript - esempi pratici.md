---
title: JavaScript e TypeScript - esempi pratici
type: reference
area: development
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [javascript, typescript, examples, async]
aliases: [Esempi JavaScript, Esempi TypeScript]
---

# JavaScript e TypeScript - esempi pratici

## Modello e type guard

```typescript
type Level = "INFO" | "WARNING" | "ERROR";

interface EventRecord {
  timestamp: string;
  level: Level;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEvent(value: unknown): EventRecord {
  if (!isRecord(value)) throw new Error("event must be an object");

  const level = String(value.level ?? "").toUpperCase();
  const message = String(value.message ?? "").trim();
  const timestamp = String(value.timestamp ?? "");

  if (!["INFO", "WARNING", "ERROR"].includes(level)) {
    throw new Error(`invalid level: ${level}`);
  }
  if (!message || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("invalid timestamp or message");
  }

  return { timestamp, level: level as Level, message };
}
```

I tipi TypeScript non validano automaticamente JSON ricevuto a runtime.

## Trasformazione

```typescript
function countByLevel(events: EventRecord[]): Record<Level, number> {
  const counts: Record<Level, number> = {
    INFO: 0,
    WARNING: 0,
    ERROR: 0,
  };

  for (const event of events) {
    counts[event.level] += 1;
  }
  return counts;
}
```

## Fetch con timeout

```typescript
async function fetchJson(url: URL, timeoutMs = 10_000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

Valida schema e dimensione della risposta. Non includere segreti nell'URL.

## DOM sicuro

```typescript
const output = document.querySelector<HTMLElement>("#output");
if (!output) throw new Error("missing #output");

const message = new URLSearchParams(location.search).get("message") ?? "";
output.textContent = message;
```

Usa `textContent` per testo non fidato; `innerHTML` introduce un sink XSS.

## Test essenziale

```typescript
import { describe, expect, it } from "vitest";

describe("parseEvent", () => {
  it("normalizes the level", () => {
    expect(
      parseEvent({
        timestamp: "2026-01-01T10:00:00Z",
        level: "info",
        message: "start",
      }).level,
    ).toBe("INFO");
  });

  it("rejects an unknown level", () => {
    expect(() =>
      parseEvent({
        timestamp: "2026-01-01T10:00:00Z",
        level: "debug",
        message: "x",
      }),
    ).toThrow();
  });
});
```

## Node: leggere JSON

```typescript
import { readFile } from "node:fs/promises";

const raw = await readFile("events.json", "utf8");
const parsed: unknown = JSON.parse(raw);
if (!Array.isArray(parsed)) throw new Error("expected an array");
const events = parsed.map(parseEvent);
```

## Collegamenti

- [[Indice - Esempi di programmazione]]
- [[03_Sviluppo/Linguaggi/JavaScript e TypeScript|JavaScript e TypeScript]]
- [[05_Risorse/Riferimenti operativi/Comandi Node npm e pnpm|Node Tooling]]
