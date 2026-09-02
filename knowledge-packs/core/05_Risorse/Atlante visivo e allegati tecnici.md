---
title: Atlante visivo e allegati tecnici
type: visual-reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-08-15
updated: 2026-08-23
source_kind: original-diagrams
tags: [diagrammi, esempi, allegati, retrieval, tools]
aliases: [Atlante visivo, Allegati tecnici]
---

# Atlante visivo e allegati tecnici

## Architettura della knowledge

![[media/knowledge-pipeline.svg]]

Le note sono la fonte modificabile. Il catalogo conserva metadati e relazioni; l’indice serve il recupero e può essere rigenerato senza perdere contenuti.

## Metodo di diagnosi

![[media/troubleshooting-loop.svg]]

Una diagnosi affidabile separa osservazione, ipotesi, test controllato ed evidenza. Il rollback viene preparato prima di una modifica significativa.

## Confini di sicurezza

![[media/security-boundaries.svg]]

I segreti restano fuori dalla knowledge. Le fonti private attraversano filtri di autorizzazione prima del retrieval e non vengono esposte nell’interfaccia pubblica.

## Formati supportati

| Tipo | Uso | Regola |
|---|---|---|
| SVG, PNG, JPEG, WebP | schemi, schermate ed evidenze visive | descrizione testuale accanto all’immagine |
| PDF | standard, manuali e report autorizzati | fonte, versione, licenza e data |
| WAV, MP3 | pronuncia, segnali ed esempi audio | trascrizione e lingua associate |
| MP4 | dimostrazioni e procedure | riassunto, capitoli e durata |
| codice | esempi riproducibili | linguaggio, prerequisiti, output atteso e rollback |

## Pipeline multimodale pubblica

- usare diagrammi originali, schermate realmente prodotte dal progetto o materiali con licenza compatibile e attribuzione;
- registrare per ogni asset hash, origine, autore, licenza, data, lingua, testo alternativo e didascalia;
- rimuovere EXIF, credenziali, indirizzi, identificatori, notifiche e altri dati personali prima della pubblicazione;
- trattare OCR e trascrizione come derivati da verificare, indicando confidenza e versione dello strumento;
- evitare scraping massivo, copie integrali di manuali, fotografie stock prive di diritti e media sintetici presentati come prove reali;
- mantenere gli asset fuori dal database: catalogo e indice conservano riferimenti e checksum.

La roadmap prevede ricerca combinata su testo, didascalie e trascrizioni solo dopo un corpus con diritti chiari e un benchmark accessibile. Nessuna immagine viene acquisita automaticamente dal web per riempire lacune editoriali.

## Collegamenti

- [[Knowledge engineering fonti retrieval e governance]]
- [[Qualita e manutenzione della Vault]]
- catalogo degli strumenti
