---
title: Analisi pacchetti e protocolli per difesa
type: technical-guide
area: network-security
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: professional-practice
tags: [pcap, wireshark, tcpdump, defense]
aliases: [Packet analysis]
---

# Analisi pacchetti e protocolli per difesa

## Sintesi

Acquisire traffico soltanto su reti autorizzate: PCAP può contenere credenziali,
contenuti e dati personali.

```bash
sudo tcpdump -D
sudo tcpdump -i eth0 -nn -s 0 -w evidence.pcap 'host 192.0.2.10'
sudo tcpdump -r evidence.pcap -nn -q
dumpcap -i 1 -b duration:300 -b files:12 -w ring.pcapng
tshark -r evidence.pcapng -q -z io,phs
tshark -r evidence.pcapng -Y 'tcp.analysis.retransmission'
tshark -r evidence.pcapng -Y 'dns.flags.response == 1' -T fields -e frame.time -e dns.qry.name -e dns.a
```

SYN, SYN-ACK e ACK aprono TCP; sequence e acknowledgment ordinano; window
applica flow control; RST interrompe; FIN chiude. Retransmission può indicare
perdita, congestione, reordering o cattura incompleta.

Conservare interfaccia, filtro, timezone, durata, punto di cattura e hash.
Correlare con DHCP, DNS, firewall, EDR e log applicativi.
