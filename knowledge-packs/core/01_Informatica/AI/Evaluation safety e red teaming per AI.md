---
title: Evaluation, safety e red teaming per AI
type: professional-guide
area: ai
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated-synthesis
tags: [evaluation, safety, red-team]
aliases: []
---

# Evaluation, safety e red teaming per AI

## Evaluation stack

- unit test di prompt parser e tool schema;
- golden set versionato;
- retrieval evaluation separata dalla generazione;
- task completion con criteri deterministici;
- human review con rubriche;
- safety suite e adversarial set;
- performance per tier hardware;
- canary e regressioni in produzione.

Ogni caso contiene input, contesto consentito, risposta attesa o rubrica,
failure severity e motivazione. Non ottimizzare sul test finale. Segmentare per
lingua, lunghezza, ambiguità, dominio e rischio.

## Dimensioni

Correttezza, groundedness, completezza, concisione, citazioni, instruction
following, tool selection, autorizzazione, latenza e costo. Per la voce:
interruzione, naturalezza, brevità e mancato ascolto.

## Red team

Testare prompt injection diretta/indiretta, data exfiltration, secret handling,
path traversal, command injection, unsafe code, social engineering, tool loop,
denial of wallet/service e cross-user memory leakage. Eseguire soltanto in
ambienti autorizzati.

## Release gate

Nessuna regressione critica, baseline confrontabile, limiti documentati, model
card aggiornata, rollback pronto e owner definito. Un punteggio medio alto non
compensa un failure raro ma catastrofico.
