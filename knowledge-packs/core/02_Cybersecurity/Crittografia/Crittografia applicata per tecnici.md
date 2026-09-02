---
title: Crittografia applicata per tecnici
type: reference
area: cybersecurity
status: verified
level: intermediate
visibility: public
created: 2026-07-27
updated: 2026-08-08
source_kind: official
tags: [cybersecurity, cryptography, tls, key-management]
aliases: [Crittografia applicata]
verified_at: 2026-08-08
review_after: 2027-02-08
rag: true
---

# Crittografia applicata per tecnici

## Modello mentale

- **Hash:** integrità e derivazione; non è cifratura.
- **MAC:** integrità e autenticità con segreto condiviso.
- **Cifratura simmetrica:** protezione efficiente dei dati con la stessa chiave.
- **Cifratura asimmetrica:** coppia pubblica/privata per accordo, cifratura o firma.
- **Firma digitale:** autenticità e integrità, non confidenzialità.
- **KDF:** deriva chiavi resistendo a brute force e riuso.

## Regole operative

- Non progettare algoritmi o protocolli crittografici personalizzati.
- Preferire librerie mantenute e primitive ad alto livello.
- Usare cifratura autenticata, per esempio AES-GCM o ChaCha20-Poly1305.
- Per password usare Argon2id, scrypt, bcrypt o PBKDF2 con parametri correnti.
- Generare nonce e chiavi con CSPRNG; un nonce non deve essere riutilizzato
  quando il protocollo lo vieta.
- Separare chiavi, dati, backup e permessi amministrativi.
- Prevedere rotazione, revoca, scadenza e distruzione verificabile.

## Checklist TLS

- Versioni e cipher suite supportati e aggiornati.
- Catena del certificato e hostname validi.
- Chiavi private non esportabili quando possibile.
- HSTS valutato per applicazioni esclusivamente HTTPS.
- Nessun fallback silenzioso a trasporto non cifrato.

## Errori frequenti

- SHA-256 usato direttamente per memorizzare password.
- cifratura senza autenticazione;
- chiavi nel repository o nei log;
- IV o nonce costanti;
- certificati ignorati dal client;
- backup cifrati con chiave conservata nello stesso posto.

## Fonti

- [NIST Cryptographic Standards and Guidelines](https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
