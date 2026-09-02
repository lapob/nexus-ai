---
title: Diagnostica Windows e PowerShell
type: note
area: tech
status: evergreen
level: intermediate
visibility: public
created: 2026-07-28
updated: 2026-08-08
source_kind: curated
tags: [windows, powershell, diagnostics, sysadmin]
aliases: [Troubleshooting Windows]
---

# Diagnostica Windows e PowerShell

## Metodo

1. definisci sintomo, orario, utente e impatto;
2. riproduci senza cambiare configurazione;
3. raccogli evidenze da Event Log, processi, servizi e rete;
4. formula una sola ipotesi verificabile;
5. applica la modifica minima e reversibile;
6. verifica, documenta e prepara il rollback.

## Comandi di lettura

```powershell
Get-ComputerInfo
Get-Process | Sort-Object CPU -Descending | Select-Object -First 15
Get-Service | Where-Object Status -ne Running
Get-WinEvent -LogName System -MaxEvents 100
Get-NetTCPConnection | Sort-Object State, RemoteAddress
Get-NetIPConfiguration
Get-Volume
Get-CimInstance Win32_PnPSignedDriver
```

Per un intervallo temporale:

```powershell
$start = (Get-Date).AddHours(-2)
Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $start } |
  Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message
```

## Integrità e manutenzione

Esegui questi strumenti soltanto dopo backup e raccolta evidenze:

```powershell
DISM.exe /Online /Cleanup-Image /ScanHealth
sfc.exe /verifyonly
chkdsk.exe C: /scan
```

Le varianti che riparano o richiedono riavvio sono modifiche di sistema:
annota stato iniziale, output, autorizzazione e risultato.

## Checklist incidente applicativo

- versione esatta e percorso dell'eseguibile;
- account e livello di integrità;
- evento Application Error e modulo con errore;
- dipendenze/runtime installati;
- file mancanti, quarantena antivirus e firme;
- permessi NTFS e Controlled Folder Access;
- proxy, DNS, TLS e porte;
- differenze rispetto a un PC funzionante;
- dump o ProcMon solo se necessario e autorizzato.

## Evidenza minima

Conserva timestamp, comando, exit code, output rilevante, modifica effettuata e
test finale. Non copiare token, password, dati cliente o dump non sanitizzati.

## Collegamenti

- [[01_Informatica/Manuale operativo del tecnico IT]]
- [[02_Cybersecurity/Blue Team/Incident Response]]
- [[05_Risorse/Metodo professionale per comandi procedure e troubleshooting|Documentazione degli interventi]]
- [[05_Risorse/Metodo professionale per comandi procedure e troubleshooting|Procedure operative]]
