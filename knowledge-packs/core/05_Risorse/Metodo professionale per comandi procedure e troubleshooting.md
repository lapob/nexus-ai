---
title: Metodo professionale per comandi, procedure e troubleshooting
type: operational-standard
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-29
updated: 2026-07-29
source_kind: curated
tags: [commands, runbook, troubleshooting, safety, documentation]
aliases: [Metodo professionale per i comandi]
---

# Metodo professionale per comandi, procedure e troubleshooting

Un comando non è conoscenza isolata: è un’azione eseguita su uno stato specifico, con prerequisiti, effetto, output, rischio e rollback. Questo standard si applica a Windows, Linux, macOS, cloud, database, reti, sviluppo e cybersecurity.

## Scheda minima di un comando

| Campo | Domanda |
|---|---|
| obiettivo | quale informazione o cambiamento serve? |
| ambiente | OS, versione, shell, host, account, directory e rete? |
| prerequisiti | tool, privilegi, file, backup e autorizzazione? |
| input | quali valori provengono dall’utente o da sistemi non fidati? |
| effetto | legge, crea, modifica, interrompe o cancella? |
| output atteso | quale prova conferma il risultato? |
| errore | cosa significano exit code, stderr e log? |
| rischio | impatto massimo e blast radius? |
| rollback | come si torna allo stato precedente? |
| evidenza | cosa conservare e come sanificarlo? |

## Prima dell’esecuzione

1. identifica host e contesto:

```powershell
$env:COMPUTERNAME
whoami
Get-Location
```

```bash
hostname
id
pwd
```

2. verifica che il target sia quello previsto;
3. preferisci modalità read-only, `--dry-run`, `--check`, `plan` o `diff`;
4. limita scope, timeout, concorrenza e quantità di output;
5. crea backup o snapshot quando il cambiamento è materiale;
6. registra l’orario iniziale e una baseline.

Non copiare comandi da Internet direttamente in una shell elevata. Leggi ogni parametro, espandi variabili e sostituisci placeholder intenzionalmente.

## Quoting e input

Shell differenti interpretano spazi, wildcard, pipe, redirect, `$`, backtick e virgolette in modo diverso.

```powershell
Get-ChildItem -LiteralPath $target
Start-Process -FilePath $program -ArgumentList $arguments
```

```bash
find "$target" -type f -print0
printf '%s\0' "${items[@]}" | xargs -0 command
```

Usa API strutturate invece di costruire una stringa di comando. Non inserire input non fidato dentro `eval`, `Invoke-Expression`, `sh -c`, query SQL concatenate o template eseguibili.

## Exit code e pipeline

Un output “bello” non implica successo. Controlla exit code e stato di ogni fase.

```powershell
& $program @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Comando fallito: exit code $LASTEXITCODE"
}
```

```bash
set -Eeuo pipefail
command_one | command_two
```

`set -e` non sostituisce una gestione errori ragionata: condizioni, subshell e pipeline hanno semantiche da comprendere.

## Troubleshooting scientifico

### 1. Definizione

- stato atteso;
- stato osservato;
- riproducibilità;
- impatto e priorità;
- primo e ultimo orario noto;
- modifica più recente.

### 2. Raccolta

Acquisisci versione, configurazione effettiva, dipendenze, salute risorse, log correlati e un esempio minimo. Conserva timezone e correlation ID.

### 3. Ipotesi

Scrivi più spiegazioni plausibili. Per ciascuna definisci una previsione osservabile e il test meno invasivo capace di smentirla.

### 4. Esperimento

Cambia una variabile per volta. Se il sistema è produttivo usa canary, replica, feature flag o finestra concordata.

### 5. Verifica

Conferma funzionalità, prestazioni, sicurezza e assenza di regressioni. Ripeti il test; un singolo successo può essere casuale.

## Runbook professionale

```markdown
# Titolo
## Scopo e non-scopo
## Prerequisiti
## Rischi e stop condition
## Baseline
## Procedura
## Output atteso
## Errori conosciuti
## Verifica
## Rollback
## Evidenze e audit
## Owner e data ultima prova
```

Un runbook non testato è un’ipotesi. Provalo periodicamente in ambiente sicuro e aggiorna versione, output e dipendenze.

## Comandi distruttivi o remoti

Per cancellazioni, storage, firewall, identità, rete e servizi remoti:

- risolvi il percorso o target in modo esplicito;
- mostra la selezione prima di agire;
- evita wildcard e directory radice;
- usa batch piccoli;
- mantieni una sessione di emergenza separata;
- definisci stop condition e contatto;
- preferisci operazioni recuperabili;
- verifica backup e restore.

## Evidenze

Registra comando con segreti rimossi, versione del tool, account/ruolo, target, orario, exit code e sintesi del risultato. Non salvare token, password, cookie, chiavi private o interi dump se non necessari.

## Gate di competenza

Sai usare un comando professionalmente quando puoi:

1. spiegarne la semantica senza eseguirlo;
2. prevedere output e failure mode;
3. limitarne l’impatto;
4. verificarne il risultato indipendentemente;
5. eseguire rollback;
6. trasformarlo in procedura ripetibile e sicura.

## Collegamenti

- [[Catalogo dei comandi]]
- [[01_Informatica/Manuale operativo del tecnico IT|Manuale operativo del tecnico IT]]
- [[Standard della Knowledge Base]]
- [[Qualita e manutenzione della Vault]]
