---
title: Zero Trust, defense-in-depth e architettura di sicurezza
type: security-guide
area: security-architecture
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [zero-trust, defense-in-depth, security-architecture, identity]
aliases: [Architettura Zero Trust]
---

# Zero Trust, defense-in-depth e architettura di sicurezza

## Principio

Zero Trust non significa “non fidarsi di nessuno” né acquistare un prodotto. Significa non concedere fiducia implicita in base alla posizione di rete e valutare esplicitamente identità, dispositivo, risorsa, contesto e rischio.

## Piano di controllo e piano dati

Il piano di controllo definisce identità, policy, chiavi e configurazione; il piano dati trasporta richieste e informazioni. Proteggere solo il traffico ma non amministrazione, CI/CD o identity lascia un percorso privilegiato.

## Componenti

- inventario di utenti, workload, device e dati;
- identity provider e autenticazione forte;
- device posture e lifecycle;
- policy decision point;
- enforcement point vicino alla risorsa;
- segmentazione e controllo egress;
- telemetria, audit e risposta;
- data classification e key management.

## Decisione di accesso

```text
soggetto + dispositivo + risorsa + azione + contesto
                         ↓
policy + rischio + stato corrente
                         ↓
allow limitato | challenge | deny
```

La decisione ha durata limitata e viene rivalutata. L’autorizzazione resta server-side e specifica per oggetto/azione.

## Defense-in-depth

Controlli indipendenti riducono la probabilità che un singolo errore comprometta tutto:

1. prevenzione;
2. limitazione del blast radius;
3. detection;
4. risposta;
5. recovery.

Ridondanza apparente non è indipendenza: due prodotti dipendenti dallo stesso identity provider condividono la stessa failure mode.

## Roadmap

1. identifica asset critici e flussi;
2. centralizza identità e MFA;
3. rimuovi account e trust inutili;
4. applica minimo privilegio e accesso temporaneo;
5. segmenta per applicazione e dati;
6. limita e osserva egress;
7. integra device/workload identity;
8. misura accessi negati, privilegi permanenti e tempo di revoca;
9. prova recovery e account di emergenza.

## Failure mode

- policy troppo complesse e non testate;
- dipendenza totale dal control plane;
- account break-glass non monitorati;
- service account statici;
- eccezioni permanenti;
- telemetria incompleta;
- blocco dell’operatività durante incidenti identity.

## Threat model

Valuta compromissione dell’IdP, furto sessione, device non conforme, workload impersonation, insider, supply chain e indisponibilità del policy engine. Definisci fail-open/fail-closed per ogni servizio in base a safety e impatto.

## Scenario tecnico
Modella una piccola applicazione con utente, amministratore, workload e database. Disegna flussi, policy, enforcement, log e recovery; simula token scaduto, device non conforme e IdP indisponibile.

## Collegamenti

- [[Modello operativo della sicurezza]]
- [[Threat Modeling]]
- [[02_Cybersecurity/Identity Windows e Active Directory/IAM Kerberos OAuth OIDC e SAML|IAM]]
- [[02_Cybersecurity/Blue Team/Mappatura attacco difesa detection e validazione|Mappatura difensiva]]
