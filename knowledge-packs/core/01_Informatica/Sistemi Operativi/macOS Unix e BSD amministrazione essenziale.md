---
title: macOS, Unix e BSD: amministrazione essenziale
type: command-reference
area: operating-systems
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [macos, unix, freebsd, openbsd, commands]
aliases: [Comandi macOS e BSD]
---

# macOS, Unix e BSD: amministrazione essenziale

## Sintesi

macOS combina kernel XNU (Mach e BSD), userland Unix, launchd, APFS e framework Apple. La sicurezza è stratificata: firma del codice, notarizzazione, Gatekeeper, sandbox, Transparency Consent and Control (TCC), System Integrity Protection, Secure Enclave e FileVault rispondono a rischi differenti. Disabilitare uno strato non è una procedura di troubleshooting.

## Architettura e avvio

| Area | Componenti | Evidenza principale |
|---|---|---|
| hardware trust | Secure Boot, Secure Enclave, recoveryOS | policy di avvio e stato FileVault |
| kernel | XNU, driver, system extension | panic report, log e stato extension |
| servizi | launchd, XPC, daemon e agent | dominio, label, PID ed exit status |
| applicazioni | bundle, firma, entitlement, sandbox | designated requirement ed entitlement |
| privacy | TCC, permission e profili | consenso, profilo e unified log |

```bash
system_profiler SPHardwareDataType SPSoftwareDataType
sysctl kern.version
kmutil showloaded
systemextensionsctl list
launchctl print system
```

Su Apple silicon la policy di sicurezza e alcune operazioni di recovery dipendono da recoveryOS. Prima di modificare extension, avvio o volumi conserva backup verificato, modello, versione e procedura di ritorno.

## Sistema e processi

```bash
uname -a
sw_vers                         # macOS
sysctl kern.osrelease
ps aux
top
pgrep -alf process
lsof -p PID
kill -TERM PID                  # arresto gestibile
```

## Filesystem e storage

```bash
ls -la
stat file
df -h
du -sh directory
mount
diskutil list                   # macOS
diskutil info /                 # macOS
gpart show                      # FreeBSD
```

Su macOS APFS supporta snapshot e volumi; sui BSD verifica UFS/ZFS e le opzioni di mount. Prima di operazioni storage conserva backup e mappa esatta dei device.

## Servizi e log

```bash
launchctl list                  # macOS
log show --last 10m --style compact
log stream --predicate 'process == "app"'
service -e                      # FreeBSD
service sshd status
tail -f /var/log/system.log
```

Con unified logging usa predicate stretti e una finestra temporale. I livelli `info` e `debug` possono non essere persistiti; la privacy può redigere valori. Non interpretare l’assenza nel log come prova che l’evento non sia avvenuto.

```bash
log show --last 15m --style compact --predicate 'process == "AppName"'
log stream --level info --predicate 'subsystem == "com.example.app"'
launchctl print gui/$(id -u)/com.example.agent
```

## Rete

```bash
ifconfig
netstat -rn
route -n get default            # macOS/BSD
scutil --dns                    # macOS
sockstat -4 -6                  # FreeBSD
nc -vz host 443
tcpdump -ni interface
```

## Pacchetti e aggiornamenti

```bash
softwareupdate --list           # macOS
softwareupdate --install --all
brew update && brew outdated    # Homebrew, se adottato
pkg update && pkg upgrade       # FreeBSD
freebsd-update fetch install
syspatch                        # OpenBSD
```

## Sicurezza macOS

```bash
spctl --status
csrutil status
fdesetup status
codesign -dv --verbose=4 /path/to/App.app
xattr -l file
```

Non disabilitare Gatekeeper, SIP o firma come scorciatoia. Verifica invece provenienza, notarizzazione, entitlement e quarantena.

```bash
codesign --verify --deep --strict --verbose=2 /Applications/App.app
codesign -d --entitlements :- /Applications/App.app
spctl --assess --type execute --verbose=4 /Applications/App.app
stapler validate /Applications/App.app
profiles status -type enrollment
```

`--deep` può nascondere una diagnosi imprecisa se usato per firmare; per la verifica inventaria anche componenti annidati. TCC protegge risorse come microfono, fotocamera, contatti e Full Disk Access; non modificarne il database direttamente. In ambiente gestito usa profili approvati e documenta scopo e durata.

## APFS, backup e recovery

APFS separa container, volume e snapshot. Uno snapshot non sostituisce un backup indipendente. Prima di First Aid o modifiche alle partizioni identifica esattamente disco fisico, container e volumi.

```bash
diskutil list
diskutil apfs list
diskutil info /
tmutil destinationinfo
tmutil latestbackup
diskutil verifyVolume /
```

Verifica il ripristino di un campione, non solo la data dell’ultimo backup. Se il filesystem o l’hardware mostrano errori, riduci le scritture e acquisisci evidenza prima di tentativi invasivi.

## Diagnostica delle prestazioni

1. registra sintomo, versione, alimentazione e pressione termica;
2. osserva CPU, memoria, I/O e rete senza terminare processi;
3. correla PID, bundle, servizio e log;
4. riproduci con un account o avvio sicuro solo se previsto;
5. cambia una variabile e conserva una via di rollback.

```bash
memory_pressure
vm_stat 1
iostat -w 1
fs_usage -w -f filesys AppName
sample PID 5
```

`fs_usage` e tracing possono raccogliere nomi sensibili e avere costo prestazionale: limita durata, filtri e accesso all’output.

## Amministrazione sicura

- usa account standard per il lavoro quotidiano e privilegi temporanei;
- mantieni FileVault, aggiornamenti e backup verificati;
- inventaria login item, agent, daemon, extension e profili;
- conserva recovery key secondo policy, separata dal dispositivo;
- revisiona condivisioni, SSH, firewall e servizi di rete;
- proteggi Keychain, token di sviluppo e certificati di firma;
- non usare Homebrew con privilegi elevati e verifica origine e formula.

## Laboratorio

Su un Mac di test o VM supportata: acquisisci inventario, crea un agent utente innocuo, osservalo con `launchctl` e unified log, verifica firma ed entitlement di una tua app, provoca un errore controllato, ripristina lo stato e documenta evidenze e limiti.

## Collegamenti

- [[Panoramica Windows Linux macOS BSD e sistemi mobili]]
- [[03_Sviluppo/Mobile/Apple Swift SwiftUI iOS e macOS|Sviluppo Apple]]
- [[02_Cybersecurity/Wireless Mobile e IoT/Sicurezza mobile Android e iOS|Sicurezza mobile]]
- [[05_Risorse/Catalogo dei comandi|Catalogo dei comandi]]
