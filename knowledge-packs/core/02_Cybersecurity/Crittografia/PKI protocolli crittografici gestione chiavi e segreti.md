---
title: PKI, protocolli crittografici, gestione chiavi e segreti
type: security-guide
area: cryptography
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [pki, cryptography, keys, secrets, tls]
aliases: [PKI e key management]
---

# PKI, protocolli crittografici, gestione chiavi e segreti

## Proprietà

- confidenzialità: solo soggetti autorizzati leggono;
- integrità: modifiche rilevabili;
- autenticità: origine verificabile;
- non ripudio: proprietà limitata che dipende da identità e custodia della chiave;
- forward secrecy: compromissione futura della chiave a lungo termine non decifra sessioni passate.

## Primitive

Hash, MAC, cifratura simmetrica, cifratura autenticata, firma digitale, key agreement e KDF risolvono problemi differenti. Non progettare protocolli combinando primitive senza una costruzione standard revisionata.

## PKI

Root CA → intermediate CA → certificato end-entity. La relying party verifica firma, validità, nome, key usage, policy, chain e revoca.

Componenti:

- offline root;
- issuing CA;
- registration authority;
- HSM o key protection;
- repository certificati;
- CRL/OCSP;
- certificate policy e practice statement;
- inventory e rinnovo.

## Ciclo di vita della chiave

1. generazione con entropy adeguata;
2. registrazione di owner, scopo e algoritmo;
3. distribuzione protetta;
4. uso limitato;
5. rotazione;
6. revoca;
7. distruzione verificabile;
8. conservazione quando richiesta per decifrare archivi.

Rotazione non significa sostituire il secret nel vault: occorre distribuire il nuovo, aggiornare consumer, verificare, revocare il vecchio e gestire rollback.

## Segreti applicativi

- mai nel codice o immagine container;
- secret manager con identity del workload;
- credenziali temporanee preferite;
- scope minimo;
- accesso auditato;
- caching breve e protetto;
- log e crash dump sanificati;
- scanner pre-commit e repository.

## TLS

Il client valida identità del server, negozia parametri e deriva chiavi di sessione. mTLS autentica anche il client, ma richiede lifecycle certificati e mapping identità.

Controlla SNI, ALPN, trust store, hostname, versioni, cipher, session resumption e clock. Certificate pinning mobile può aumentare disponibilità risk se non prevede rotazione e backup pin.

## Password

Password hashing usa KDF lenta e salt univoco: Argon2id, scrypt, bcrypt o PBKDF2 secondo piattaforma e policy. Il pepper, se usato, resta separato dal database.

## Errori frequenti

- nonce/IV riutilizzato;
- cifratura senza autenticazione;
- chiave usata per più scopi;
- random non crittografico;
- certificato accettato senza hostname;
- secret in log o URL;
- algoritmo custom;
- backup che conserva chiavi revocate senza controllo.

## Scenario tecnico
Crea una root e una intermediate esclusivamente di laboratorio, emetti certificati server/client, configura mTLS locale, prova rinnovo e revoca, documenta trust store e distruggi le chiavi al termine.

## Collegamenti

- [[Crittografia applicata per tecnici]]
- [[01_Informatica/Networking/DNS DHCP PKI e troubleshooting dei servizi di rete|Troubleshooting PKI]]
- [[02_Cybersecurity/Identity Windows e Active Directory/IAM Kerberos OAuth OIDC e SAML|IAM]]
