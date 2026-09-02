---
title: Standard laboratorio e raccolta evidenze
type: methodology
area: cybersecurity
status: evergreen
level: foundation
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [lab, evidence, cybersecurity]
aliases: [Workflow Lab, Note Lab]
---

# Standard laboratorio e raccolta evidenze

## Scheda iniziale

| Campo | Valore |
|---|---|
| obiettivo | |
| autorizzazione | sistema posseduto / piattaforma autorizzata |
| scope incluso | |
| esclusioni | |
| topologia e versioni | |
| snapshot | |
| criterio di stop | |
| cleanup | |

## Metodo

1. scrivi aspettativa e ipotesi;
2. registra stato iniziale;
3. cambia una variabile;
4. salva comando/azione, timestamp e risultato;
5. confronta con log o stato del target;
6. separa fatto, inferenza e domanda;
7. ripristina e verifica il cleanup.

## Evidenze

- usa UTC o indica timezone;
- calcola hash per file importanti;
- conserva originale separato dalla copia di lavoro;
- oscura segreti e minimizza dati personali;
- annota versione, origine e trasformazioni;
- una schermata senza contesto non è riproducibile.

## Chiusura

- [ ] Obiettivo verificato o falsificato.
- [ ] Nessun target fuori scope.
- [ ] Artefatti e account temporanei rimossi.
- [ ] Snapshot/ripristino verificato.
- [ ] Lezioni collegate a una nota concettuale.
- [ ] Prossimo esperimento definito.
