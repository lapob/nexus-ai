---
title: Comandi strumenti Python
type: reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-07-23
source_kind: curated
tags: [python, tooling, testing, commands]
aliases: [Python Commands]
---

# Comandi strumenti Python

## Runtime e ambiente

```bash
python --version
python -c "import sys; print(sys.executable)"
python -m venv .venv
```

```powershell
.\.venv\Scripts\Activate.ps1
```

```bash
source .venv/bin/activate
deactivate
```

## Dipendenze

```bash
python -m pip install --upgrade pip
python -m pip install nome-pacchetto
python -m pip install -r requirements.txt
python -m pip list
python -m pip show nome-pacchetto
python -m pip check
python -m pip freeze
```

Installa solo da fonti attese e dentro l'ambiente del progetto. Prima di aggiornare, salva lo stato e verifica changelog/test.

## Esecuzione e moduli

```bash
python script.py
python -m package.modulo
python -m http.server 8000
python -m json.tool file.json
python -m compileall src
```

Il server HTTP integrato è solo per sviluppo locale e non sostituisce un server di produzione.

## Test e qualità

```bash
python -m unittest
python -m unittest discover -s tests
python -m pytest
python -m pytest -q
python -m pytest --maxfail=1
ruff check .
ruff format --check .
mypy src
```

## Packaging

```bash
python -m pip install build
python -m build
python -m pip install -e .
```

## Diagnostica

```bash
python -X dev script.py
python -m pdb script.py
python -m timeit "sum(range(1000))"
python -m trace --trace script.py
```

## Collegamenti

- [[01_Informatica/Python/Python per automazione e sicurezza|Python operativo]]
- [[03_Sviluppo/Esempi di programmazione/Python - esempi pratici|Esempi Python]]
