---
title: Comandi HTTP API e TLS
type: reference
area: resources
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-07-23
source_kind: curated
tags: [http, api, tls, curl, openssl, commands]
aliases: [curl Commands, TLS Commands]
---

# Comandi HTTP API e TLS

## HTTP con curl

```bash
curl --head https://example.com/
curl --verbose https://example.com/
curl --fail-with-body --silent --show-error https://example.com/
curl --request POST \
  --header "Content-Type: application/json" \
  --data '{"name":"test"}' \
  https://api.example.test/items
```

Non inserire token reali negli esempi o nella history. Usa variabili d'ambiente temporanee e oscura gli header nei log.

## Timeout e output

```bash
curl --connect-timeout 5 --max-time 20 https://example.com/
curl --output response.json https://api.example.test/items
curl --write-out "%{http_code}\n" --output /dev/null https://example.com/
```

## JSON con jq

```bash
jq . response.json
jq '.items[] | {id, name}' response.json
jq -r '.token // empty' response.json
```

Non stampare segreti in terminali registrati o pipeline CI.

## DNS

```bash
dig example.com A
dig example.com AAAA
dig example.com MX
dig +trace example.com
```

## TLS e certificati

```bash
openssl s_client \
  -connect example.com:443 \
  -servername example.com

openssl x509 -in certificate.pem -noout -text
openssl x509 -in certificate.pem -noout -subject -issuer -dates
openssl dgst -sha256 file.bin
```

`s_client` serve a osservare handshake e certificati; non dimostra da solo che l'applicazione sia sicura.

## Server locale di sviluppo

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Usalo solo per file non sensibili e sviluppo locale.

## Collegamenti

- [[01_Informatica/Networking/Fondamenti di rete|Fondamenti di rete]]
- [[03_Sviluppo/APIs/Indice - APIs|API]]
- [[02_Cybersecurity/Web Security/Metodologia di test web|Test web autorizzato]]
