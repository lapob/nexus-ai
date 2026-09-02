---
title: Catalogo degli strumenti di sicurezza
type: reference
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-08-01
updated: 2026-08-01
source_kind: curated
tags: [security-tools, ethical-hacking, blue-team, forensics, lab]
aliases: [Strumenti di cybersecurity]
---

# Catalogo degli strumenti di sicurezza

Il catalogo supporta la selezione degli strumenti in base a scopo, prerequisiti, telemetria e limiti. Ogni attività richiede autorizzazione scritta, obiettivo, confini, finestra temporale, gestione delle evidenze e procedura di arresto.

## Ricognizione e superficie di attacco

| Scopo | Strumenti | Evidenza attesa |
|---|---|---|
| inventario rete | Nmap, Masscan in lab, arp-scan | host, porte, servizi, timestamp |
| DNS e domini | dig, dnsrecon, Amass, Subfinder | record, sottodomini, provenienza |
| esposizione Internet | Shodan, Censys, crt.sh | asset pubblici già osservabili |
| metadati e fonti aperte | ExifTool, SpiderFoot, Maltego | relazione documentata tra entità |

La ricognizione passiva non equivale automaticamente ad autorizzazione. Rispetta condizioni d'uso, privacy, giurisdizione e minimizzazione dei dati.

## Web e API

Burp Suite e OWASP ZAP intercettano e riproducono richieste; mitmproxy automatizza flussi controllati; ffuf e dirsearch verificano content discovery entro limiti concordati; Nuclei applica template revisionabili; Postman e curl aiutano a isolare contratti API. La metodologia di riferimento è [[Web Security/Metodologia di test web|Metodologia di test web]].

## Identità, Windows e Active Directory

BloodHound rappresenta relazioni e percorsi di privilegio; PingCastle e Purple Knight valutano configurazioni; Sysinternals, PowerShell logging e Windows Event Forwarding supportano analisi e difesa. Impacket, NetExec e Rubeus sono dual-use: usali soltanto in cyber range o assessment esplicitamente autorizzati, con account di test e logging completo.

## Rete, wireless e protocolli

Wireshark e tcpdump analizzano pacchetti; Zeek produce log semantici; Suricata applica regole IDS/IPS; Scapy costruisce pacchetti per test di protocollo. Aircrack-ng e strumenti SDR richiedono ambiente radio isolato o autorizzazione specifica: le trasmissioni possono oltrepassare fisicamente il laboratorio.

## Vulnerability management

Nessus, OpenVAS/Greenbone e scanner cloud individuano segnali da verificare manualmente. Trivy, Grype e Syft analizzano immagini e SBOM; Semgrep, CodeQL, SonarQube e linters cercano difetti nel codice; Gitleaks e TruffleHog individuano segreti da revocare. Uno scanner non dimostra automaticamente sfruttabilità né priorità.

## Password e autenticazione

Hashcat e John the Ripper servono per audit offline su hash autorizzati e dataset sintetici. Misura resistenza, algoritmo, parametri, MFA e protezioni anti-abuso. Non conservare password recuperate: documenta la debolezza e distruggi in sicurezza i materiali secondo le regole dell'incarico.

## Reverse engineering e malware analysis

Ghidra, IDA Free, Binary Ninja, radare2, Cutter, x64dbg, WinDbg e Frida aiutano a comprendere binari e runtime. YARA classifica artefatti; capa riconosce capacità; FLOSS estrae stringhe. Usa campioni in sandbox isolata, snapshot, rete simulata e raccolta di indicatori; non distribuire payload funzionanti.

## Blue Team e incident response

Velociraptor e osquery interrogano endpoint; Sysmon amplia telemetria Windows; Sigma descrive detection portabili; ELK/OpenSearch, Splunk e Microsoft Sentinel correlano eventi; Volatility analizza memoria; Autopsy e The Sleuth Kit supportano forensics disco. Conserva catena di custodia, hash, orari e azioni effettuate.

## Cloud, container e supply chain

Prowler, ScoutSuite e Steampipe valutano configurazioni; kube-bench e kube-hunter operano su Kubernetes autorizzato; Falco osserva runtime; Cosign firma artefatti; dependency scanners e SBOM tracciano componenti. Privilegi minimi, account temporanei e scope espliciti evitano che il test diventi incidente.

## Criterio di scelta

Scegli lo strumento con minor invasività capace di verificare l'ipotesi. Registra versione, configurazione, input, output grezzo, falsi positivi, impatto e comando riproducibile sanitizzato. Confronta sempre il risultato con almeno una seconda evidenza.

## Riferimenti autoritativi

- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [MITRE ATT&CK Enterprise Matrix](https://attack.mitre.org/matrices/enterprise/)
- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework)
- [RFC Editor Index](https://www.rfc-editor.org/rfc-index/)
