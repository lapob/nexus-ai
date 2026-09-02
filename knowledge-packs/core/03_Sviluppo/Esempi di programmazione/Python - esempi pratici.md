---
title: Python - esempi pratici
type: reference
area: development
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [python, examples, cli, testing]
aliases: [Esempi Python]
---

# Python - esempi pratici

## Modello dati e validazione

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class Event:
    timestamp: datetime
    level: str
    message: str


def parse_event(raw: dict[str, Any]) -> Event:
    level = str(raw.get("level", "")).upper()
    message = str(raw.get("message", "")).strip()
    if level not in {"INFO", "WARNING", "ERROR"}:
        raise ValueError(f"invalid level: {level!r}")
    if not message:
        raise ValueError("message is required")

    return Event(
        timestamp=datetime.fromisoformat(str(raw["timestamp"])),
        level=level,
        message=message,
    )
```

## Leggere JSON Lines senza caricare tutto

```python
import json
from collections.abc import Iterator
from pathlib import Path


def read_events(path: Path) -> Iterator[Event]:
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            try:
                yield parse_event(json.loads(line))
            except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                raise ValueError(f"{path}:{line_number}: {exc}") from exc
```

## Aggregazione

```python
from collections import Counter
from collections.abc import Iterable


def count_by_level(events: Iterable[Event]) -> dict[str, int]:
    return dict(Counter(event.level for event in events))
```

## CLI

```python
import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error("input must be an existing file")

    result = count_by_level(read_events(args.input))
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

## Test con unittest

```python
import unittest
from datetime import datetime


class CountByLevelTests(unittest.TestCase):
    def test_counts_events(self) -> None:
        events = [
            Event(datetime.fromisoformat("2026-01-01T10:00:00"), "INFO", "start"),
            Event(datetime.fromisoformat("2026-01-01T10:01:00"), "ERROR", "fail"),
            Event(datetime.fromisoformat("2026-01-01T10:02:00"), "ERROR", "retry"),
        ]

        self.assertEqual(count_by_level(events), {"INFO": 1, "ERROR": 2})


if __name__ == "__main__":
    unittest.main()
```

## Richiesta HTTP con standard library

```python
import json
from urllib.request import Request, urlopen


request = Request(
    "https://api.example.test/status",
    headers={"Accept": "application/json"},
)
with urlopen(request, timeout=10) as response:
    if response.status != 200:
        raise RuntimeError(f"unexpected status: {response.status}")
    payload = json.load(response)
```

Non disabilitare la verifica TLS e non registrare token o body sensibili.

## Miglioramenti

- property-based test sul parser;
- limite alla dimensione delle righe;
- logging strutturato;
- metriche su eventi invalidi;
- output streaming per dataset grandi.

## Collegamenti

- [[Indice - Esempi di programmazione]]
- [[01_Informatica/Python/Python per automazione e sicurezza|Python operativo]]
- [[05_Risorse/Riferimenti operativi/Comandi strumenti Python|Python Tooling]]
