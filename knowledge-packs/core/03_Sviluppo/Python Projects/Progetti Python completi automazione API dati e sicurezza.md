---
title: Progetti Python completi automazione API dati e sicurezza
type: project-catalog
area: python
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: official-docs
tags: [python, projects, testing, packaging, portfolio]
aliases: [Progetti Python completi]
---

# Progetti Python completi automazione API dati e sicurezza

## Ambiente standard

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install pytest ruff mypy build pip-audit
python -m pytest
ruff check .
mypy src
python -m build
pip-audit
```

Blocca dipendenze per applicazioni, separa dev/runtime, non installare globalmente e non eseguire input non fidato con `eval`, shell implicita o deserializzazione pericolosa.

## 1. CLI inventario host

Output JSON versionato, plugin di check, timeout e redazione dati. Testa comando assente, permesso negato, disco pieno e output non UTF-8.

```python
from dataclasses import asdict, dataclass
import json, platform

@dataclass(frozen=True)
class Host:
    schema_version: int
    system: str
    release: str

print(json.dumps(asdict(Host(1, platform.system(), platform.release()))))
```

## 2. Organizzatore di file dry-run

Calcola il piano, mostra collisioni e applica soltanto con `--commit`. Usa `pathlib`, hash, journal e rollback. Non seguire symlink fuori dalla root.

## 3. API locale con database

CRUD, migration, pagination, idempotency key, authz, rate limit, audit e health endpoint. Testa transazioni concorrenti e indisponibilità database.

## 4. Pipeline dati

Importa CSV/JSON, valida schema, scarta record invalidi in quarantine, produce metriche e un report riproducibile. Conserva origine e hash.

## 5. Monitor di integrità

Crea baseline hash per una directory di laboratorio e rileva aggiunte, modifiche e rimozioni. Escludi segreti, limita dimensioni, gestisci rename e timestamp instabili.

## 6. Analizzatore log difensivo

Parser streaming, normalizzazione eventi, regole locali e fixture sintetiche. Output: regola, evidenza, severità, motivazione e falso positivo noto. Non raccogliere dati reali non autorizzati.

## 7. Web app completa

Dashboard accessibile con API Python, database, job asincrono e frontend separato. Aggiungi OpenAPI, CSP, test browser, container non-root, backup/restore e osservabilità.

## 8. Package riutilizzabile

`pyproject.toml`, type hints, API pubblica piccola, SemVer, changelog, documentazione ed esempi eseguibili. Costruisci wheel e provala in un ambiente pulito.

## Definition of done

- test unitari e integrazione;
- lint e type check;
- nessun segreto;
- errori e cancellazione gestiti;
- README riproducibile;
- licenze dipendenze controllate;
- benchmark quando conta;
- threat model;
- pacchetto installabile;
- demo e screenshot privi di dati personali.

## Fonti

- Python tutorial: https://docs.python.org/3/tutorial/
- Packaging guide: https://packaging.python.org/
- pytest: https://docs.pytest.org/

## Collegamenti

- [[Indice - Python Projects]]
- [[01_Informatica/Python/Python per automazione e sicurezza|Python per automazione]]
- [[03_Sviluppo/Testing e qualita del software|Testing]]
