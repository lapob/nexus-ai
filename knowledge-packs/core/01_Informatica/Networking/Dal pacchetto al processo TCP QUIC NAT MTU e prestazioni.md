---
title: Dal pacchetto al processo: TCP, QUIC, NAT, MTU e prestazioni
type: technical-guide
area: networking
status: evergreen
level: advanced
visibility: public
created: 2026-07-30
updated: 2026-08-08
source_kind: curated
tags: [networking, tcp, quic, nat, mtu, performance, troubleshooting]
aliases: [Vita di un pacchetto, Networking internals]
---

# Dal pacchetto al processo: TCP, QUIC, NAT, MTU e prestazioni

## Seguire una richiesta

Per una richiesta HTTPS:

1. l'app risolve nome e policy proxy;
2. il sistema sceglie route e interfaccia;
3. ARP o Neighbor Discovery risolve il next hop locale;
4. firewall e NAT valutano il flusso;
5. TCP stabilisce la connessione oppure QUIC usa UDP;
6. TLS autentica e negozia chiavi;
7. HTTP scambia richiesta e risposta;
8. socket, runtime e applicazione elaborano i byte.

Diagnosticare nello stesso ordine evita di attribuire a “Internet” un errore DNS, TLS o applicativo.

## Comandi multipiattaforma

Linux:

```bash
ip -br addr
ip route get 1.1.1.1
ip neigh
ss -tpn
resolvectl query example.org
tracepath example.org
```

Windows:

```powershell
Get-NetIPConfiguration
Get-NetRoute -AddressFamily IPv4 |
    Sort-Object RouteMetric
Get-NetNeighbor
Get-NetTCPConnection
Resolve-DnsName example.org
Test-NetConnection example.org -Port 443 -InformationLevel Detailed
```

Protocollo applicativo e TLS:

```bash
curl -v --connect-timeout 5 https://example.org/
openssl s_client -connect example.org:443 -servername example.org </dev/null
```

## TCP

TCP fornisce uno stream ordinato, non messaggi. Una `send` non equivale a una `recv`. Concetti chiave:

- handshake e teardown;
- sequence e acknowledgment number;
- receive window e flow control;
- congestion window e congestion control;
- retransmission timeout;
- selective acknowledgment;
- Nagle e delayed ACK;
- keepalive applicativo e TCP.

Latenza alta con perdita minima può ridurre throughput; buffer enormi possono creare bufferbloat. Distinguere perdita reale, riordinamento e cattura incompleta.

## QUIC e HTTP/3

QUIC integra trasporto sicuro sopra UDP, riduce round trip e gestisce stream indipendenti. UDP bloccato può causare fallback a HTTP/2. Una cattura non mostra payload QUIC in chiaro senza chiavi di sessione, ma espone timing, endpoint, dimensioni e perdita.

## NAT e stateful firewall

NAT modifica indirizzi o porte e mantiene stato. Problemi comuni:

- timeout della tabella;
- port exhaustion;
- hairpin NAT;
- regole asimmetriche;
- sovrapposizione delle subnet;
- protocolli che incorporano indirizzi nel payload.

Verificare il flusso sui due lati e non assumere che una cattura rappresenti l'intero percorso.

## MTU e PMTUD

Un MTU errato può consentire ping piccoli ma bloccare TLS o trasferimenti:

```bash
ping -M do -s 1472 1.1.1.1
tracepath example.org
```

Su Windows:

```powershell
ping 1.1.1.1 -f -l 1472
Get-NetIPInterface | Select-Object InterfaceAlias, NlMtu, AddressFamily
```

Con IPv4, 1472 byte più 28 byte di header producono 1500; tunnel e VPN riducono il budget. PMTUD richiede messaggi ICMP appropriati.

## Cattura responsabile

```bash
sudo tcpdump -i any -nn -s 0 -w capture.pcap \
    'host 192.0.2.10 and (tcp port 443 or udp port 443)'
```

Limitare host, porte, durata e dimensione. Le catture possono contenere dati personali e token: proteggere, minimizzare e cancellare secondo policy.

## Metodo prestazionale

Misurare separatamente:

- DNS;
- connect;
- TLS;
- time to first byte;
- download;
- retry e code applicative.

```bash
curl -sS -o /dev/null \
  -w 'dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}\n' \
  https://example.org/
```

## Scenario tecnico
In due VM controllate introdurre latenza, perdita e MTU ridotto con strumenti di traffic shaping. Confrontare `curl`, cattura pacchetti e metriche applicative; spiegare perché throughput e latenza cambiano.

## Collegamenti

- [[Fondamenti di rete]]
- [[Diagnostica e analisi di rete]]
- [[IPv6 routing firewall VPN e diagnostica avanzata]]
- [[02_Cybersecurity/Network Security/Analisi pacchetti e protocolli per difesa|Analisi pacchetti]]
- [[05_Risorse/Riferimenti operativi/Comandi HTTP API e TLS|Comandi HTTP API e TLS]]
