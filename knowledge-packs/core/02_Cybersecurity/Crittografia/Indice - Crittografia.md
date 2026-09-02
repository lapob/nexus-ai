---
title: Crittografia
type: index
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-07-23
source_kind: curated
tags: [cybersecurity, cryptography]
aliases: []
---

# Crittografia

- [[Crittografia applicata per tecnici]]
- [[PKI protocolli crittografici gestione chiavi e segreti]]

Concetti: entropia e CSPRNG, hash/MAC, cifratura simmetrica autenticata, chiavi pubbliche, firme, key exchange, KDF/password hashing, certificati/PKI, TLS e key lifecycle.

Regole: non progettare algoritmi o protocolli propri; usa librerie mature e modalità AEAD; nonce unici; password con KDF resistente; chiavi in KMS/HSM/secret store; rotazione e revoca pianificate; confronti constant-time dove necessario.

Comprendi il threat model: la crittografia non corregge autorizzazioni errate, endpoint compromessi o gestione chiavi debole.
