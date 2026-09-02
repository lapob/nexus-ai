---
title: PowerShell internals, remoting, logging e automazione robusta
type: technical-guide
area: windows
status: evergreen
level: advanced
visibility: public
created: 2026-07-30
updated: 2026-08-08
source_kind: curated
tags: [powershell, windows, remoting, logging, automation, security]
aliases: [PowerShell avanzato, PowerShell internals]
---

# PowerShell internals, remoting, logging e automazione robusta

## Sintesi

PowerShell trasporta oggetti .NET nella pipeline. Il testo compare soprattutto ai confini: console, file, programmi nativi e rete. Capire questa differenza evita parsing fragile e perdita di tipi.

## Esplorare prima di modificare

```powershell
Get-Command Get-Process -Syntax
Get-Help Get-Process -Full
Get-Process | Get-Member
Get-Process | Select-Object -First 3 Name, Id, CPU, Path
Get-CimInstance Win32_OperatingSystem |
    Select-Object Caption, Version, LastBootUpTime
```

`Format-Table` e `Format-List` sono operazioni di presentazione: usarle alla fine. Dopo la formattazione la pipeline non contiene più gli oggetti originali.

## Errori e contratti

Gli errori possono essere terminanti o non terminanti. Per automazione affidabile:

```powershell
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

try {
    $service = Get-Service -Name 'w32time' -ErrorAction Stop
}
catch {
    Write-Error "Impossibile leggere il servizio: $($_.Exception.Message)"
    throw
}
```

Una funzione professionale valida input, restituisce oggetti e non mescola output diagnostico con dati:

```powershell
function Get-FileDigestRecord {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
        [string] $Path
    )

    $item = Get-Item -LiteralPath $Path
    $hash = Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256
    [pscustomobject]@{
        Path = $item.FullName
        Bytes = $item.Length
        SHA256 = $hash.Hash
    }
}
```

## Quoting e programmi nativi

Usare `-LiteralPath` per percorsi dell'utente. Non costruire comandi con `Invoke-Expression`. Passare argomenti come array quando si avvia un processo e controllare exit code, stdout e stderr.

```powershell
$arguments = @('--version')
$process = Start-Process -FilePath 'git.exe' -ArgumentList $arguments `
    -NoNewWindow -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "git exit code $($process.ExitCode)" }
```

## Processi, servizi, eventi e rete

```powershell
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10
Get-Service | Where-Object Status -eq 'Running'
Get-WinEvent -FilterHashtable @{
    LogName = 'System'
    Level = 2,3
    StartTime = (Get-Date).AddHours(-2)
} -MaxEvents 100
Get-NetTCPConnection -State Listen |
    Sort-Object LocalPort |
    Select-Object LocalAddress, LocalPort, OwningProcess
Test-NetConnection example.org -Port 443 -InformationLevel Detailed
```

Correlare `OwningProcess` con `Get-Process -Id`. Un evento è un indizio, non automaticamente la root cause.

## Remoting autorizzato

PowerShell Remoting usa WSMan su Windows PowerShell e può usare SSH nelle versioni moderne. Abilitazione, firewall, autenticazione e delega vanno progettati; non usare `TrustedHosts *`.

```powershell
Test-WSMan -ComputerName server-lab
New-PSSession -ComputerName server-lab -Credential (Get-Credential)
Invoke-Command -ComputerName server-lab -ScriptBlock {
    Get-Service | Where-Object Status -eq 'Stopped'
}
Get-PSSession | Remove-PSSession
```

Il “second hop” è un problema di delega delle credenziali, non un errore casuale. Preferire JEA, endpoint limitati e account dedicati.

## Logging e sicurezza

In ambienti amministrati considerare:

- Script Block Logging;
- Module Logging;
- trascrizione protetta;
- AMSI;
- PowerShell Operational Log;
- JEA e Constrained Language Mode dove appropriato.

Non registrare password, token, contenuti di `SecureString` o variabili d'ambiente sensibili. Firmare script distribuiti, applicare ACL e usare repository fidati.

## Prestazioni

Evitare `+=` su grandi array, chiamate remote dentro cicli e `Where-Object` quando il provider può filtrare alla fonte. Misurare:

```powershell
Measure-Command { Get-ChildItem -LiteralPath C:\Windows -File }
Trace-Command -Name ParameterBinding -Expression {
    Get-Process | Select-Object -First 1
} -PSHost
```

## Scenario tecnico
Creare uno script read-only che raccolga versione OS, spazio disco, servizi falliti, ultimi errori System e porte in ascolto. Restituire JSON, oscurare dati sensibili, aggiungere timeout e testarlo come utente standard.

## Collegamenti

- [[Diagnostica Windows e PowerShell]]
- [[Windows kernel processi token ETW e diagnostica avanzata]]
- [[05_Risorse/Riferimenti operativi/Comandi PowerShell|Comandi PowerShell]]
- [[03_Sviluppo/Linguaggi/Shell e PowerShell|Shell e PowerShell]]
- [[02_Cybersecurity/Identity Windows e Active Directory/Hardening e auditing Active Directory|Hardening Active Directory]]
