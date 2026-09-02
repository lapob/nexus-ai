---
title: Procedure di assessment autorizzato e validazione difensiva
type: procedure
area: ethical-hacking
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: official-docs
tags: [assessment, pentest, validation, remediation, authorized]
aliases: [Procedure di assessment di sicurezza]
---

# Procedure di assessment autorizzato e validazione difensiva

## Sintesi

> [!danger]
> Le procedure si applicano soltanto a sistemi propri o con autorizzazione scritta. Scope, sorgenti, orari, tecniche vietate, dati, condizioni di arresto e contatti devono essere espliciti.

## Pre-engagement

Raccogli obiettivo, asset inclusi/esclusi, IP e domini, account di test, ambienti, finestre, limiti di traffico, trattamento dati, notifica SOC, contatto emergenza, cleanup, retest e formato del report.

## Workflow

1. valida scope e sincronizza orari;
2. crea evidenze con timestamp e tool version;
3. esegui discovery read-only e a basso impatto;
4. costruisci mappa asset-servizio-identità-dato;
5. formula ipotesi di rischio;
6. valida manualmente con prova minima;
7. arrestati appena l’impatto è dimostrato;
8. rimuovi artefatti di test;
9. comunica finding critici subito;
10. produci remediation verificabile e retest.

## Comandi di laboratorio a basso impatto

```bash
# singolo host di laboratorio: discovery servizi/versioni
nmap -sV --version-light -T3 --max-retries 2 192.0.2.10

# configurazione TLS di un servizio proprio
openssl s_client -connect lab.example.test:443 -servername lab.example.test

# header HTTP senza scaricare il body
curl -I --max-time 10 https://lab.example.test/

# acquisizione difensiva limitata
tcpdump -i eth0 -nn -s 0 -c 500 -w evidence.pcap
```

`192.0.2.0/24` è rete di documentazione. Sostituiscila soltanto con il target autorizzato. Evita scansioni Internet, brute force, denial of service, persistenza, distruzione e raccolta indiscriminata.

## Web e API

Segui categorie WSTG: information gathering, configuration, identity, authentication, authorization, sessione, input validation, error handling, crittografia, business logic, client-side e API. Per ogni test conserva richiesta minima, risposta sanificata, prerequisiti e causa radice. Non confondere un banner con una vulnerabilità.

## Identity e host

Valuta policy, lifecycle, MFA, privilegi, service account, logging e trust. Usa account di test. La prova deve dimostrare l’autorizzazione mancante senza accedere a dati reali di altri utenti.

## Cloud e container

Controlla IAM, esposizione, secret, cifratura, log, network policy, immagini, provenance, runtime policy, backup e recovery. Parti da configurazione e API read-only.

## Priorità del finding

Valuta asset, prerequisiti, affidabilità della prova, impatto su confidenzialità/integrità/disponibilità, blast radius, rilevabilità e compensating control. CVSS è un input, non la decisione aziendale completa.

## Retest

Ripeti esattamente la condizione originale, verifica fix e regressioni, controlla che il logging funzioni e chiudi il finding solo con evidenza. Se la correzione non è possibile, documenta rischio residuo, owner e scadenza.

## Fonti

- OWASP WSTG: https://owasp.org/www-project-web-security-testing-guide/latest/
- NIST SP 800-115: https://csrc.nist.gov/pubs/sp/800/115/final
- NIST CSF 2.0: https://www.nist.gov/cyberframework

## Collegamenti

- [[Regole di ingaggio e reporting]]
- [[Tecniche e toolchain di penetration test autorizzato]]
- [[02_Cybersecurity/Blue Team/Mappatura attacco difesa detection e validazione|Validazione difensiva]]
