---
title: Metodologia penetration test
type: methodology
area: cybersecurity
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-08-08
source_kind: curated
tags: [pentest, methodology, ethical-hacking]
aliases: [Metodologia pentest]
---

# Metodologia penetration test

## Flusso

1. **pre-engagement:** obiettivi, scope, rischio e comunicazioni;
2. **ricognizione consentita:** inventory e superficie esposta;
3. **enumerazione:** servizi, ruoli, flussi e trust;
4. **analisi:** ipotesi, configurazioni, vulnerabilità e falsi positivi;
5. **validazione controllata:** prova minima concordata;
6. **post-validazione:** nessuna persistenza non autorizzata, cleanup e integrità;
7. **report:** rischio, evidenza, causa e remediation;
8. **retest:** verifica del controllo, non semplice assenza del payload.

## Decision gate prima di ogni azione

- l'asset è nello scope?
- la tecnica è consentita?
- conosco impatto e criterio di stop?
- posso dimostrare con meno privilegio o meno dati?
- esiste un contatto se il sistema degrada?
- come verifico e annullo l'effetto?

## Qualità

Un buon assessment trova anche assunzioni errate, controllo efficace e limiti del test. Non gonfia la severità, non confonde scanner con prova e non espande il perimetro per curiosità.

## Collegamenti

- [[Regole di ingaggio e reporting]]
- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Assessment di rete]]
- [[02_Cybersecurity/Web Security/Metodologia di test web|Test web]]
- [[02_Cybersecurity/Labs/Standard laboratorio e raccolta evidenze|Evidenze]]
