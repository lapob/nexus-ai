---
title: Sistemi riproducibili con Nix e NixOS
type: guide
area: operating-systems
status: evergreen
level: intermediate
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: official-docs
tags: [nix, nixos, reproducibility, dev-environments]
aliases: [NixOS, reproducible systems]
---

# Sistemi riproducibili con Nix e NixOS

Nix tratta build e dipendenze come valori identificati dagli input. Il suo store immutabile permette versioni parallele, rollback e ambienti dichiarativi; NixOS estende il modello alla configurazione del sistema.

## Concetti

- derivation: ricetta completa di una build;
- store path: risultato indirizzato dagli input;
- profile e generation: viste versionate con rollback;
- flake: interfaccia dichiarativa con input bloccati;
- binary cache: artefatti firmati riutilizzabili.

## Workflow consigliato

1. descrivi ambiente e comandi in `flake.nix`;
2. blocca le revisioni in `flake.lock`;
3. usa `nix develop` per un ambiente isolato;
4. verifica con `nix flake check`;
5. costruisci con `nix build` e pubblica solo output tracciabili;
6. su NixOS prova una nuova generation e conserva un rollback avviabile.

Riproducibile non significa automaticamente sicuro: valuta provenienza degli input, firme delle cache, segreti esterni allo store e aggiornamenti. Non inserire token nelle derivation perché lo store può essere leggibile localmente.

## Casi d'uso

Onboarding coerente, CI uguale allo sviluppo, toolchain scientifiche, homelab dichiarativo e recovery. Per team piccoli, documenta prima l'operatività: il linguaggio Nix e il debugging del grafo hanno una curva di apprendimento reale.

## Fonti primarie

- Nix Reference Manual, https://nix.dev/manual/nix/latest/
- NixOS Manual, https://nixos.org/manual/nixos/stable/
- Nixpkgs Manual, https://nixos.org/manual/nixpkgs/stable/
