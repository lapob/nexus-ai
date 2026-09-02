---
title: WSL
type: concept
area: tech
status: verified
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-08-08
source_kind: curated
tags: [nexus, tech]
aliases: []
verified_at: 2026-08-08
review_after: 2027-02-08
---

# WSL

## Sintesi

Ambiente Linux integrato in Windows. WSL 1 traduce le chiamate di sistema; WSL 2 utilizza un kernel Linux in una macchina virtuale gestita e offre compatibilità superiore.

## Concetti Chiave

- Distribuzioni, filesystem Windows/Linux e integrazione con terminale.
- Collegamenti: [[01_Informatica/Linux/Fondamenti e amministrazione Linux]], [[Comandi Linux]], [[01_Informatica/Python/Indice - Python|Python]]

## Comandi

```powershell
wsl --list --verbose
wsl --install
wsl --shutdown
wsl --update
```

## Confini e rischi

WSL integra strettamente Windows e Linux: filesystem montati, processi e rete non hanno lo stesso isolamento di una VM dedicata. È adatto a sviluppo e amministrazione, ma non a eseguire malware o target ostili.

- conserva i progetti Linux nel filesystem della distribuzione quando serve performance;
- non duplicare segreti tra profili Windows e Linux;
- verifica binding dei servizi e porte esposte;
- usa una VM isolata per laboratori offensivi o software non fidato.

## Diagnostica

`wsl --status`, `wsl --version` e `wsl --list --verbose` distinguono versione del componente, kernel e distribuzioni. Per carichi I/O intensivi in WSL 2, i file del progetto risiedono preferibilmente nel filesystem Linux anziché sotto `/mnt/c`.

## Fonti primarie

- Microsoft Learn, WSL: https://learn.microsoft.com/windows/wsl/about
- Comandi WSL: https://learn.microsoft.com/windows/wsl/basic-commands
- Confronto WSL 1 e WSL 2: https://learn.microsoft.com/windows/wsl/compare-versions
