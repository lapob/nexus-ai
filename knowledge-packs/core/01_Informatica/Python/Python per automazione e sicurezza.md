---
title: Python per automazione e sicurezza
type: reference
area: tech
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [python, automation, security]
aliases: [Python operativo]
---

# Python per automazione e sicurezza

## Ambiente riproducibile

```bash
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip freeze
```

Usa un ambiente per progetto, dipendenze dichiarate e versioni controllate. Non eseguire pacchetti sconosciuti con privilegi elevati.

## Struttura di un tool

- `argparse` per input CLI;
- funzioni pure per logica testabile;
- `pathlib` per percorsi;
- `logging` per eventi e livelli;
- `json`/`csv` per output strutturato;
- `subprocess.run([...], check=True)` senza shell quando invochi programmi;
- timeout, gestione eccezioni specifiche e cleanup.

```python
from pathlib import Path

def sha256_file(path: Path) -> str:
    import hashlib
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
```

## Sicurezza

- non concatenare input in query, comandi o percorsi;
- valida tipo, formato, dimensione e confini;
- non registrare token o contenuti sensibili;
- usa timeout e limiti sulle risorse;
- separa raccolta, trasformazione e scrittura;
- testa input ostili oltre al caso felice.

## Progetti progressivi

1. inventory di file con hash e output JSON;
2. parser di log con test;
3. correlatore di indicatori su dataset sintetico;
4. client API con retry, rate limit e secret esterno.

## Fonti

- Python Software Foundation, “The Python Tutorial”, https://docs.python.org/3/tutorial/, consultato il 2026-07-23.
