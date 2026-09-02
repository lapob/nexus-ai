---
title: Incident Response
type: runbook
area: cybersecurity
status: verified
level: foundation
visibility: public
created: 2026-07-12
updated: 2026-08-08
source_kind: standard
tags: [cybersecurity, incident-response, dfir]
aliases: []
verified_at: 2026-08-08
review_after: 2027-02-08
---

# Incident Response

## Sintesi

NIST SP 800-61 Rev. 3, pubblicata nel 2025, integra la risposta agli incidenti nel NIST Cybersecurity Framework 2.0. La risposta non è quindi una sequenza isolata: **Govern, Identify e Protect** preparano; **Detect, Respond e Recover** gestiscono e migliorano l'organizzazione durante e dopo l'incidente.

## Preparazione minima

- inventario di asset, identità, dati e proprietari;
- severità e criteri di dichiarazione dell'incidente;
- Incident Commander e responsabili tecnico, comunicazione, legale/privacy;
- canali fuori banda e contatti verificati;
- accesso a log, EDR, copie forensi e backup;
- autorità per isolare host, account, tenant o servizi;
- playbook e tabletop periodici;
- requisiti di notifica determinati dai responsabili competenti.

## Triage e severità

Valuta impatto su riservatezza, integrità, disponibilità, sicurezza fisica e continuità; ampiezza; criticità degli asset; privilegi ottenuti; persistenza; dati coinvolti e propagazione in corso. La severità deve determinare persone, tempi e autorità, non essere solo un'etichetta.

## Primi 30 minuti

1. Apri un registro con orari assoluti, fonte, analista e azione.
2. Valida il segnale senza modificare inutilmente il sistema.
3. Identifica asset, account, dati e servizi coinvolti.
4. Dichiara proprietario, severità provvisoria e canale di coordinamento.
5. Conserva telemetria volatile e a rischio di rotazione.
6. Definisci una misura di contenimento reversibile e il suo impatto.
7. Formula ipotesi su accesso iniziale, privilegio, persistenza e movimento laterale.
8. Assegna azioni con responsabile e scadenza.

## Evidenze

Documenta chi ha raccolto cosa, quando, dove e con quale strumento. Conserva originale protetto, hash quando appropriato e copia di lavoro. Sincronizza i riferimenti temporali e annota timezone e drift. Non promettere “forensic soundness” se processo e strumenti non la garantiscono.

## Contenimento

Scegli tra monitorare, limitare, isolare o spegnere in base a rischio operativo ed evidenze. Esempi: disabilitare sessioni, isolare endpoint, bloccare indicatori ad alta confidenza, restringere egress, sospendere integrazioni, revocare token.

Prima di agire chiedi:

- l'attaccante si accorgerà della misura?
- perderemo telemetria o accesso alle evidenze?
- la misura interrompe servizi critici?
- esiste rollback?
- stiamo contenendo solo un sintomo?

## Eradicazione e recovery

Rimuovi persistenza e vettore iniziale, correggi misconfiguration e vulnerabilità, ricostruisci da fonti note, ruota credenziali da sistemi puliti e verifica dipendenze. Ripristina per fasi con criteri di successo, monitoraggio rafforzato e possibilità di rollback.

Non dichiarare chiuso finché scope, root cause, stato degli asset e rischi residui non sono accettati dal responsabile.

## Comunicazione

Usa aggiornamenti brevi: fatti confermati, ipotesi, impatto, azioni, decisioni richieste e prossimo aggiornamento. Separa comunicazione tecnica, manageriale e legale. Notifiche a clienti, autorità o assicurazione devono seguire piano e responsabilità definite.

## Dopo l'incidente

Entro un tempo prestabilito esegui una retrospettiva senza colpe:

- timeline e decisioni;
- controlli che hanno funzionato o fallito;
- tempo di rilevamento, contenimento e recovery;
- gap di log, asset, accessi e competenze;
- azioni con proprietario, priorità e scadenza;
- nuove detection e test del playbook.

## Modello di aggiornamento

```text
Incidente / severità:
Ora e timezone:
Fatti confermati:
Impatto osservato:
Scope noto / ignoto:
Azioni completate:
Decisioni richieste:
Prossimo aggiornamento:
```

## Fonte ufficiale

- [NIST SP 800-61 Rev. 3 — Incident Response Recommendations and Considerations for Cybersecurity Risk Management](https://csrc.nist.gov/pubs/sp/800/61/r3/final)

## Collegamenti

- [[Threat Hunting e Detection Engineering]]
- [[Manuale operativo di cybersecurity|Manuale operativo di cybersecurity]]
- [[02_Cybersecurity/Digital Forensics e Malware Analysis/Indice - Digital Forensics e Malware Analysis|Digital Forensics e Malware Analysis]]
