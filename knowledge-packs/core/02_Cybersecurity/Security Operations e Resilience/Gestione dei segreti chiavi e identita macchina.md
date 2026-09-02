---
title: Gestione dei segreti chiavi e identita macchina
type: reference
area: cybersecurity
status: evergreen
level: advanced
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [secrets-management, pki, workload-identity, key-management]
aliases: [Secrets management]
---

# Gestione dei segreti chiavi e identita macchina

Un segreto non è una stringa da nascondere: è una capacità che deve avere proprietario, scopo, durata, percorso di distribuzione, telemetria e procedura di revoca. Non inserire mai segreti reali nella knowledge, nei prompt, nei log o negli esempi.

## Gerarchia preferibile

1. Elimina il segreto usando identità federata o workload identity.
2. Usa credenziali temporanee e limitate a risorsa e operazione.
3. Conserva il materiale in un secret manager o HSM/KMS.
4. Se un file è inevitabile, cifra, limita ACL, evita sincronizzazioni e definisci rotazione.

Vault, AWS Secrets Manager, Azure Key Vault, Google Secret Manager e sistemi KMS centralizzano policy e audit. SPIFFE/SPIRE, OIDC federation e managed identities riducono credenziali statiche. SOPS e age sono utili per configurazioni cifrate, purché le chiavi restino separate.

## Ciclo di vita

Inventario → classificazione → emissione → distribuzione → uso → monitoraggio → rotazione → revoca → prova di eliminazione. Definisci TTL, dual control per chiavi critiche, break-glass monitorato e procedure per indisponibilità del vault.

## Repository e pipeline

Applica secret scanning pre-commit e server-side con Gitleaks, TruffleHog o funzioni native della forge. Una scoperta richiede revoca immediata, ricerca nell'intera cronologia e nei log, nuova emissione e analisi dell'uso; rimuovere soltanto il commit non basta. Le pipeline devono ricevere token effimeri e non stamparli.

## Chiavi crittografiche

Separa chiavi di cifratura, firma e autenticazione. Registra algoritmo, dimensione, versione, key usage, custode e dipendenze. Pianifica crypto-agility e migrazione senza inventare crittografia proprietaria. Per PKI e protocolli vedi [[../Crittografia/PKI protocolli crittografici gestione chiavi e segreti|PKI e gestione chiavi]].

## Verifica

Controlla che una credenziale scaduta smetta davvero di funzionare, che la rotazione non interrompa il servizio, che i log non contengano materiale sensibile e che il ripristino richieda identità e autorizzazioni previste.
