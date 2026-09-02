---
title: Hardening e auditing Active Directory
type: reference
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-24
updated: 2026-08-08
source_kind: curated
tags: [cybersecurity, active-directory, windows, hardening, blue-team]
aliases: [Baseline difensiva Active Directory, Audit Active Directory]
---

# Hardening e auditing Active Directory

## Sintesi

> [!warning]
> Esegui assessment e modifiche soltanto con autorizzazione, finestra di cambiamento, backup e piano di rollback.

## Obiettivo

Ridurre i percorsi di privilegio, rendere osservabili le modifiche sensibili e mantenere recuperabile il servizio directory. Il risultato atteso non è una checklist “spuntata”, ma una baseline misurabile con owner, eccezioni e test periodici.

## Inventario iniziale

- forest, domain, trust, site e domain controller;
- functional level e sistemi fuori supporto;
- gruppi privilegiati, account di servizio e deleghe;
- GPO, OU, ACL non standard e logon script;
- AD CS, ADFS/Entra Connect, DNS e dipendenze;
- backup System State e procedura di forest recovery.

Comandi di ricognizione amministrativa:

```powershell
Get-ADForest
Get-ADDomain
Get-ADDomainController -Filter *
Get-ADTrust -Filter *
Get-ADGroupMember "Domain Admins" -Recursive
Get-ADUser -Filter * -Properties Enabled,PasswordLastSet,LastLogonDate |
  Select-Object SamAccountName,Enabled,PasswordLastSet,LastLogonDate
```

Non esportare attributi non necessari e proteggi gli output come dati sensibili.

## Controlli prioritari

1. account amministrativi separati da quelli quotidiani;
2. MFA e accesso condizionale dove applicabile;
3. Windows LAPS per password locali uniche e ruotate;
4. gMSA per servizi compatibili, evitando password statiche;
5. riduzione di NTLM e protocolli legacy dopo inventario;
6. SMB signing, LDAP signing/channel binding e Kerberos moderni secondo compatibilità;
7. tiering amministrativo e workstation privilegiate;
8. review periodica di gruppi, deleghe, ACL e GPO;
9. patching rapido dei controller e minimo software installato;
10. backup offline/immutabile e prove reali di ripristino.

## Telemetria

Centralizza Security, Directory Service, DNS Server, PowerShell e log degli strumenti di identità. Monitora almeno:

- aggiunte a gruppi privilegiati;
- creazione, riattivazione o modifica di account sensibili;
- reset password e cambi delle policy;
- modifiche GPO, trust, deleghe e ACL;
- autenticazioni anomale e ticket Kerberos sospetti;
- modifiche a AD CS e template certificati;
- cancellazione log o disabilitazione dei sensori.

## Evidenza di audit

Ogni finding deve contenere condizione, asset, impatto, evidenza minima, riferimento alla baseline, remediation, owner e data di retest. Non includere password, hash, ticket o chiavi nel report.

## Collegamenti

- [[Indice - Identity Windows e Active Directory]]
- [[02_Cybersecurity/Blue Team/Threat Hunting e Detection Engineering|Threat Hunting]]
- [[02_Cybersecurity/Blue Team/Incident Response|Incident Response]]
- [[02_Cybersecurity/Ethical Hacking/Regole di ingaggio e reporting|Struttura dei finding]]
