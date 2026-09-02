---
title: Modello operativo della sicurezza
type: concept
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [cybersecurity, risk, controls]
aliases: [Fondamenti di sicurezza]
---

# Modello operativo della sicurezza

## Catena concettuale

`asset → minaccia → vulnerabilità → scenario → impatto/probabilità → rischio → controllo → rischio residuo`

- **asset:** ciò che ha valore;
- **minaccia:** causa potenziale di danno;
- **vulnerabilità:** condizione sfruttabile o debolezza;
- **rischio:** combinazione contestuale di probabilità e impatto;
- **controllo:** misura che previene, rileva, risponde o recupera.

Una CVE non è automaticamente un rischio alto: servono esposizione, prerequisiti, impatto e controlli esistenti.

## Obiettivi

- confidenzialità: accesso solo ai soggetti autorizzati;
- integrità: modifiche autorizzate e rilevabili;
- disponibilità: servizio e dati accessibili quando richiesti;
- autenticità, accountability, privacy e safety completano il modello.

## Principi

- least privilege e need-to-know;
- secure by default e deny by default;
- defense in depth senza controlli ridondanti ciechi;
- separazione dei compiti;
- riduzione della superficie;
- logging utile, minimizzato e protetto;
- resilienza, backup verificati e recovery.

## Verifica di un controllo

Per ogni controllo definisci minaccia coperta, owner, configurazione, telemetria, test positivo/negativo, failure mode e procedura di rollback.

## Collegamenti

- [[Threat Modeling]]
- [[02_Cybersecurity/Governance Rischio e Compliance/Indice - Governance Rischio e Compliance|GRC]]
- [[02_Cybersecurity/Blue Team/Incident Response|Incident Response]]
