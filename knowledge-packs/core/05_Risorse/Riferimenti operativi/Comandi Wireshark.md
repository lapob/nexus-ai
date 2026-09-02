---
title: Comandi Wireshark
type: reference
area: resources
status: evergreen
level: foundation
visibility: public
created: 2026-07-07
updated: 2026-07-23
source_kind: curated
tags: [nexus, resources]
aliases: []
---

# Comandi Wireshark

Riferimento operativo per filtri Wireshark, cattura traffico e analisi rapida dei pacchetti in lab o ambienti autorizzati.

## Collegamenti Correlati

- [[01_Informatica/Networking/Diagnostica e analisi di rete|Wireshark Base]]
- [[02_Cybersecurity/Network Security/Assessment e monitoraggio di rete|Packet Analysis]]
- [[02_Cybersecurity/Labs/Lab 004 - Wireshark|Lab 004 - Wireshark]]
- [[01_Informatica/Networking/Comandi Networking - Tech|Comandi Networking]]
- [[01_Informatica/Networking/Fondamenti di rete|DNS]]
- [[01_Informatica/Networking/Fondamenti di rete|HTTP e HTTPS]]

## Tabella Comando -> Descrizione

| Filtro / Azione | Descrizione |
|---|---|
| `ip.addr == 192.168.1.10` | Mostra traffico da o verso un IP. |
| `ip.src == 192.168.1.10` | Mostra traffico con IP sorgente specifico. |
| `ip.dst == 192.168.1.10` | Mostra traffico con IP destinazione specifico. |
| `tcp.port == 80` | Mostra traffico TCP sulla porta 80. |
| `udp.port == 53` | Mostra traffico UDP sulla porta 53. |
| `dns` | Mostra pacchetti DNS. |
| `http` | Mostra traffico HTTP. |
| `tls` | Mostra traffico TLS. |
| `tcp.analysis.flags` | Mostra possibili anomalie TCP. |
| `Follow TCP Stream` | Ricostruisce una conversazione TCP. |
| `tcp.stream eq 0` | Isola un singolo flusso TCP. |
| `tcp.flags.syn == 1 && tcp.flags.ack == 0` | Mostra tentativi iniziali di connessione. |
| `dns.flags.response == 1` | Mostra risposte DNS. |
| `http.request.method == "POST"` | Mostra richieste HTTP POST non cifrate. |

## Comandi Essenziali

```text
ip.addr == 192.168.1.10
tcp
udp
dns
http
tls
tcp.port == 443
udp.port == 53
tcp.analysis.flags
```

## Esempi Pratici

### Filtrare traffico di un host

```text
ip.addr == 192.168.1.10
```

### Analizzare richieste DNS

```text
dns
```

### Vedere traffico web non cifrato

```text
http
```

### Filtrare una porta specifica

```text
tcp.port == 80
```

### Cercare problemi TCP

```text
tcp.analysis.flags
```

## Errori Comuni

- Confondere capture filter e display filter.
- Analizzare traffico senza sapere quale interfaccia e corretta.
- Dimenticare che HTTPS cifra il contenuto applicativo.
- Usare filtri troppo larghi e perdere tempo nel rumore.
- Non salvare il file `.pcapng` del lab.

## tshark

```bash
tshark -D
tshark -r lab.pcapng
tshark -r lab.pcapng -Y "dns"
tshark -r lab.pcapng -Y "http.request" -T fields \
  -e frame.time -e ip.src -e http.host -e http.request.uri
```

## Indicazioni operative

- Prima domanda: quale host, quale protocollo, quale porta?
- Per esercizi guidati usare [[02_Cybersecurity/Labs/Lab 004 - Wireshark|Lab 004 - Wireshark]].
