---
title: SIEM, log analysis e regole di detection
type: technical-guide
area: blue-team
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: professional-practice
tags: [siem, logs, detection, sigma]
aliases: [Detection engineering operativa]
---

# SIEM, log analysis e regole di detection

## Sintesi

Sorgente → raccolta autenticata → parsing → normalizzazione → arricchimento →
storage → detection → triage → risposta. Controllare source health, ingest lag,
parse failure, duplicati, timezone e retention.

Ogni regola contiene ipotesi, data source, logica, finestra, eccezioni,
severità, mapping ATT&CK, test, owner e revisione.

```yaml
title: PowerShell con comando codificato
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\powershell.exe'
    CommandLine|contains:
      - '-EncodedCommand'
      - ' -enc '
  condition: selection
falsepositives:
  - automazioni amministrative autorizzate
level: medium
```

Il triage verifica identità, parent process, host, firma, rete e timeline. Non
isolare automaticamente un host basandosi su un solo indicatore debole.
