---
title: Comandi Node npm e pnpm
type: reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-07-23
source_kind: curated
tags: [nodejs, npm, pnpm, javascript, commands]
aliases: [Node Commands, npm Commands]
---

# Comandi Node npm e pnpm

## Runtime e progetto

```bash
node --version
npm --version
node app.js
npm init
npm init -y
```

## Dipendenze

```bash
npm install
npm install nome-pacchetto
npm install --save-dev nome-pacchetto
npm uninstall nome-pacchetto
npm outdated
npm audit
npm explain nome-pacchetto
```

`npm audit` è un segnale, non una prova completa di rischio. Valuta raggiungibilità, versione, fix e breaking change.

## Script

```bash
npm run
npm run dev
npm test
npm run build
npm run lint
npx nome-tool --help
```

## Installazione riproducibile

```bash
npm ci
pnpm install --frozen-lockfile
```

Usa un solo package manager per repository e conserva il lockfile.

## pnpm

```bash
corepack enable
pnpm install
pnpm add nome-pacchetto
pnpm add -D nome-pacchetto
pnpm remove nome-pacchetto
pnpm run test
pnpm why nome-pacchetto
```

## Diagnostica

```bash
node --inspect app.js
npm config list
npm cache verify
npm ls --depth=0
```

Evita `npx` su pacchetti non verificati: può scaricare ed eseguire codice.

## Collegamenti

- [[03_Sviluppo/Linguaggi/JavaScript e TypeScript|JavaScript e TypeScript]]
- [[03_Sviluppo/Esempi di programmazione/JavaScript e TypeScript - esempi pratici|Esempi JavaScript e TypeScript]]
