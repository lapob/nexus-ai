---
title: Endpoint EDR email e browser defense
type: reference
area: cybersecurity
status: evergreen
level: advanced
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [edr, endpoint, email-security, browser-security]
aliases: [Endpoint e messaging defense]
---

# Endpoint EDR email e browser defense

Endpoint, browser, posta e identità formano un unico confine operativo. La difesa efficace combina configurazione, telemetria, prevenzione, detection e capacità di isolamento senza dipendere da un solo prodotto.

## Baseline endpoint

- inventario attendibile di hardware, sistema, software, cifratura e proprietario;
- Secure Boot, TPM, aggiornamenti, application control e privilegi minimi;
- protezione credenziali, firewall host, DNS sicuro e logging temporizzato;
- gestione centralizzata con eccezioni documentate e scadenza;
- backup dei dati, non dell'infezione o della configurazione compromessa.

## EDR e telemetria

Microsoft Defender for Endpoint, CrowdStrike, SentinelOne, Elastic Defend, osquery, Sysmon e Velociraptor coprono casi differenti. Valuta qualità degli eventi, isolamento, live response, retention, integrazioni, tamper protection e impatto. Una detection deve dichiarare fonte dati, logica, severità, falsi positivi, test e azione attesa.

## Email

SPF autorizza mittenti ma non garantisce autenticità del contenuto; DKIM firma il messaggio; DMARC definisce allineamento e policy. Aggiungi protezione link/allegati, sandboxing, impersonation detection e procedure rapide di segnalazione. Per BEC e frodi, la contromisura decisiva è spesso un secondo canale di verifica per pagamenti e cambi anagrafici.

## Browser e SaaS

Gestisci estensioni con allowlist, separa profili personali e di lavoro, riduci sessioni persistenti, applica aggiornamenti rapidi e usa passkey o MFA resistente al phishing. CSP, isolamento dei siti, download reputation e controllo OAuth riducono superfici diverse. Revoca token e sessioni, non soltanto la password.

## Triage minimo

Preserva orari e identificativi; acquisisci albero processi, connessioni, persistenza, utente, sessioni browser e messaggio originale; isola soltanto quando beneficio e impatto sono compresi; conserva evidenze prima della bonifica. Per approfondire usa [[../Blue Team/Incident Response|Incident Response]].

## Validazione

Usa Atomic Red Team o simulazioni equivalenti esclusivamente in lab/tenant autorizzati, scegliendo test innocui e reversibili. Misura se il controllo previene, osserva, correla e guida una risposta; “alert presente” non equivale a processo efficace.
