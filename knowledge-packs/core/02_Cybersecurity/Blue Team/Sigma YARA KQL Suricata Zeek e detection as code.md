---
title: Sigma, YARA, KQL, Suricata, Zeek e detection-as-code
type: security-guide
area: detection-engineering
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [sigma, yara, kql, suricata, zeek, detection]
aliases: [Detection languages]
---

# Sigma, YARA, KQL, Suricata, Zeek e detection-as-code

## Regola completa

Una detection contiene ipotesi, telemetria, query, finestra, severità, esclusioni, test positivo/negativo, owner, playbook e metrica. Versiona regola e test insieme.

## Sigma

```yaml
title: Esempio processo con parametro inatteso
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\example.exe'
    CommandLine|contains: '--unexpected'
  condition: selection
falsepositives:
  - Attività amministrativa approvata
level: medium
```

Adatta field mapping e backend SIEM; una conversione sintattica non garantisce equivalenza.

## YARA

```yara
rule Training_Suspicious_Configuration {
  meta:
    purpose = "laboratorio"
  strings:
    $marker = "training-marker" ascii wide
    $config = /server=[a-z0-9.-]{3,80}/ ascii
  condition:
    filesize < 5MB and all of them
}
```

Combina proprietà stabili; evita hash o stringhe generiche come unica condizione. Testa performance e falsi positivi su corpus benigno.

## KQL

```text
DeviceProcessEvents
| where Timestamp > ago(1h)
| where FileName =~ "example.exe"
| summarize Count=count(), Devices=dcount(DeviceId) by AccountName
| order by Count desc
```

Filtra presto, usa colonne necessarie, definisci baseline e preserva il denominatore.

## Suricata e Zeek

Suricata applica signature e protocol parsing; Zeek produce log semantici e script di analisi. Per rete cifrata usa metadata, DNS, certificati, flow e telemetria endpoint senza trattare un singolo indicatore come verdetto.

## Pipeline

Lint → test su fixture → conversione → staging → shadow mode → tuning → produzione → metriche → review. Misura copertura, precisione, latenza e dipendenza dai sensori.

## Collegamenti

- [[Threat Hunting e Detection Engineering]]
- [[SIEM log analysis e regole di detection]]
- [[Mappatura attacco difesa detection e validazione]]
