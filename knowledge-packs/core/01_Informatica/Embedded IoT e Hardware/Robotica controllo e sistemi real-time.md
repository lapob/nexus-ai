---
title: Robotica, controllo e sistemi real-time
type: guide
area: embedded
status: evergreen
level: advanced
visibility: public
created: 2026-08-09
updated: 2026-08-09
source_kind: curated
tags: [robotica, controllo, real-time, ros]
aliases: [robotics, control systems, RTOS]
---

# Robotica, controllo e sistemi real-time

Un robot è un sistema cyber-fisico: sensori stimano lo stato, un controllore decide, gli attuatori modificano il mondo e la dinamica chiude l'anello. La correttezza comprende tempo, stabilità e sicurezza fisica, non solo output software.

## Catena funzionale

1. acquisizione e timestamp dei sensori;
2. calibrazione, filtraggio e sensor fusion;
3. localizzazione e stima dello stato;
4. pianificazione di traiettoria e comportamento;
5. controllo PID, state-space o model predictive;
6. attuazione con limiti, watchdog e arresto sicuro.

Hard real-time richiede che una deadline non venga mancata; soft real-time tollera degrado limitato. Analizza worst-case execution time, priorità, inversione di priorità, jitter e budget end-to-end. Frequenza elevata non equivale a determinismo.

## Laboratorio progressivo

Prima simula dinamica e guasti; poi usa hardware-in-the-loop; infine prova a bassa energia con area protetta. In ROS 2 definisci QoS per affidabilità e latenza, sincronizza gli orologi e registra rosbag riproducibili. Ogni attuatore deve avere limiti indipendenti dal processo principale.

## Sicurezza

Prevedi emergency stop fisico, interlock, modalità degradata, autenticazione dei comandi e confini di rete. Non testare autonomia o radiofrequenza in spazi pubblici senza valutazione dei rischi e autorizzazioni.

## Fonti primarie

- ROS 2 documentation, https://docs.ros.org/en/rolling/
- FreeRTOS documentation, https://www.freertos.org/Documentation/RTOS_book.html
- NASA, *Systems Engineering Handbook*, https://www.nasa.gov/reference/systems-engineering-handbook/
