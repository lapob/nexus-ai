---
title: Comandi per assessment autorizzati
type: command-reference
area: ethical-hacking
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: curated
tags: [ethical-hacking, commands, authorized, reconnaissance, validation]
aliases: [Comandi ethical hacking autorizzato]
---

# Comandi per assessment autorizzati

> [!authorized]
> Esegui soltanto su asset esplicitamente inclusi nello scope. Imposta rate conservativi, usa account di test e interrompi se osservi instabilità, dati non previsti o sistemi di terzi.

## Preparazione

```bash
date -Is
pwd
ip -br address
ip route
mkdir -p evidence/{raw,notes,report}
sha256sum scope.txt
```

Registra autorizzazione, CIDR, domini, esclusioni, finestra, source IP, contatto e stop condition.

## DNS e registrazione

```bash
dig example.test A
dig example.test AAAA
dig example.test MX
dig example.test NS
dig +trace example.test
host example.test
whois example.test
```

Le informazioni WHOIS possono essere redatte o protette. Non assumere che un sottodominio appartenga allo scope: validalo.

## Discovery controllata

```bash
nmap -sn 192.0.2.0/28
nmap -sT -Pn -p 22,80,443 --reason --open 192.0.2.10
nmap -sV --version-light -p 443 192.0.2.10
nmap -oA evidence/raw/service-map -sT -sV --top-ports 100 192.0.2.0/28
```

Usa `-sT` senza privilegi quando sufficiente. Non usare rate aggressivi su apparati fragili. `filtered` non significa servizio assente.

## HTTP

```bash
curl -sS -D headers.txt -o body.html https://app.example.test/
curl -sS -I https://app.example.test/
curl -sS --max-time 10 --connect-timeout 3 https://app.example.test/health
curl -sS -X OPTIONS -D - -o /dev/null https://app.example.test/api/
```

Non inserire token nella cronologia shell. Usa un file di configurazione protetto o variabili temporanee e rimuovile al termine.

## Content discovery

```bash
ffuf -u https://app.example.test/FUZZ \
  -w approved-words.txt \
  -rate 10 -timeout 5 -ac \
  -of json -o evidence/raw/ffuf.json

feroxbuster --url https://app.example.test/ \
  --wordlist approved-words.txt \
  --rate-limit 10 --depth 2 \
  --json --output evidence/raw/ferox.json
```

Usa wordlist pertinente e piccola. Escludi logout, delete, export e funzioni che modificano stato.

## TLS

```bash
openssl s_client -connect app.example.test:443 \
  -servername app.example.test -showcerts

openssl x509 -in certificate.pem -noout \
  -subject -issuer -serial -dates -fingerprint -sha256

testssl.sh --warnings batch --jsonfile-pretty evidence/raw/tls.json \
  https://app.example.test
```

Verifica SAN, catena, protocolli, cipher, HSTS e comportamento reale dei client. Un finding TLS va valutato rispetto al threat model.

## API

```bash
jq . response.json
curl -sS -H 'Accept: application/json' \
  'https://app.example.test/api/items?limit=10' | jq .
```

Per GraphQL usa query approvate e limiti bassi. Per gRPC usa reflection solo se prevista:

```bash
grpcurl -plaintext api.example.test:50051 list
grpcurl -d '{"id":"training"}' api.example.test:50051 package.Service/Get
```

## Nuclei in modalità governata

```bash
nuclei -u https://app.example.test \
  -severity info,low,medium \
  -rate-limit 5 -concurrency 2 \
  -jsonl -output evidence/raw/nuclei.json
```

Usa template revisionati e consentiti. Scanner output è un’ipotesi: conferma manualmente senza aumentare l’impatto.

## Proxy

Burp Suite, ZAP e mitmproxy richiedono browser e account di test. Installa la CA soltanto nel profilo di laboratorio e rimuovila al termine. Non intercettare traffico personale.

```bash
mitmproxy --listen-host 127.0.0.1 --listen-port 8080
zap-baseline.py -t https://app.example.test -r baseline.html
```

## Evidenze

```bash
find evidence -type f -print0 | sort -z | xargs -0 sha256sum > evidence/SHA256SUMS
tar -czf assessment-evidence.tar.gz evidence
```

Sanifica cookie, token, dati personali e contenuti non necessari.

## Non incluso

Credential attack, payload, persistence, evasion, destructive testing e weaponization richiedono procedure specifiche, approvazione aggiuntiva e non appartengono a questa reference.

## Collegamenti

- [[02_Cybersecurity/Ethical Hacking/Tecniche e toolchain di penetration test autorizzato|Toolchain autorizzata]]
- [[Comandi Nmap]]
- [[Comandi HTTP API e TLS]]
- [[Comandi Wireshark]]
