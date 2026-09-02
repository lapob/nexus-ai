---
title: Ragionamento offensivo autorizzato, evidenze e catene di rischio
type: technical-guide
area: cybersecurity
status: evergreen
level: advanced
visibility: public
created: 2026-07-30
updated: 2026-08-08
source_kind: curated
tags: [ethical-hacking, assessment, evidence, attack-path, remediation, authorization]
aliases: [Catene di rischio, Ragionamento da penetration tester]
---

# Ragionamento offensivo autorizzato, evidenze e catene di rischio

## Sintesi

Questa nota riguarda esclusivamente laboratori propri o assessment con autorizzazione scritta. Lo scopo è trasformare osservazioni in rischio verificabile e remediation, limitando impatto e raccolta dati.

## Dal controllo alla domanda

Un assessment efficace non parte dal tool ma da domande:

- quali asset e identità attraversano il confine?
- quale assunzione di fiducia può essere falsa?
- quale controllo dovrebbe impedire o rilevare l'azione?
- quale evidenza minima dimostra il rischio?
- come verificare senza accedere a dati reali?
- come ripristinare lo stato?

Ogni attività deve essere mappata a scope, regola di ingaggio e finestra temporale.

## Ipotesi e catene

Un finding isolato può avere impatto basso; una catena può cambiare il rischio:

```text
esposizione -> identità -> privilegio -> movimento -> dato/servizio -> impatto
```

Documentare ogni arco con precondizione, evidenza e controllo mancante. Non dichiarare una catena completa se un passaggio non è stato verificato: distinguere osservato, riprodotto e ipotizzato.

## Matrice di prova

| Campo | Domanda |
|---|---|
| asset | cosa è autorizzato testare? |
| precondizione | quale accesso iniziale serve? |
| azione minima | qual è la prova meno invasiva? |
| evidenza | quale output dimostra il fatto? |
| impatto | quale obiettivo aziendale è esposto? |
| detection | quale log dovrebbe comparire? |
| cleanup | cosa va rimosso o ripristinato? |
| remediation | quale controllo elimina la causa? |
| retest | come dimostrare la correzione? |

## Enumerazione responsabile

Enumerare significa costruire un inventario verificato, non generare traffico indiscriminato. Stabilire:

- rate e concorrenza;
- range e porte autorizzate;
- protocolli fragili esclusi;
- contatti di emergenza;
- arresto automatico su errori;
- timestamp e conservazione dell'output.

Preferire fonti passive e configurazioni fornite dal cliente prima di scansioni attive. Correlare DNS, CMDB, cloud inventory e risultati, segnalando divergenze.

## Identità e autorizzazione

Per ogni servizio verificare:

1. autenticazione;
2. gestione sessione;
3. autorizzazione su oggetto e funzione;
4. separazione tenant;
5. privilegi amministrativi;
6. recovery e revoca;
7. logging.

Usare account e dati sintetici. Non tentare password reali, credential stuffing o tecniche fuori scope. Una prova con due utenti di test è spesso sufficiente per dimostrare un controllo oggetto mancante.

## Validazione difensiva

Un assessment maturo verifica anche la capacità di osservare:

- quale evento viene generato;
- se timestamp e identità sono corretti;
- se il SIEM lo riceve;
- se la regola produce un alert utile;
- se il runbook porta alla decisione giusta;
- se il controllo blocca il retest.

Questo trasforma penetration test in miglioramento misurabile, non in elenco di tool.

## Severità

Separare:

- probabilità tecnica;
- prerequisiti e affidabilità;
- esposizione;
- impatto su riservatezza, integrità e disponibilità;
- blast radius;
- rilevabilità;
- controlli compensativi.

CVSS aiuta la comparabilità ma non sostituisce il contesto. Esplicitare assunzioni e non gonfiare il rischio.

## Reporting professionale

Un finding contiene:

- titolo orientato alla causa;
- asset e scope;
- descrizione;
- evidenza minimizzata;
- passaggi riproducibili e sicuri;
- impatto realistico;
- causa primaria;
- remediation prioritaria;
- detection e hardening;
- criterio di retest.

Rimuovere token, password, dati personali e payload non necessari. Conservare hash degli allegati e catena di custodia quando richiesta.

## Laboratorio purple-team

Nel cyber range personale:

1. definire una tecnica ATT&CK innocua e osservabile;
2. stabilire evento atteso e query;
3. eseguire una simulazione controllata;
4. raccogliere log;
5. valutare copertura e falsi positivi;
6. migliorare regola e runbook;
7. ripetere;
8. ripristinare snapshot.

## Collegamenti

- [[Regole di ingaggio e reporting]]
- [[Metodologia penetration test]]
- [[Procedure di assessment autorizzato e validazione difensiva]]
- [[02_Cybersecurity/Blue Team/Mappatura attacco difesa detection e validazione|Mappatura attacco e difesa]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze|Standard laboratorio ed evidenze]]
- [[02_Cybersecurity/Governance Rischio e Compliance/Gestione delle vulnerabilita|Gestione delle vulnerabilità]]
