# Wake relay: contratto del client Android

NexusRemote non incorpora URL privati, MAC, broadcast o codice Wake-on-LAN. La superficie di associazione compare soltanto quando una risposta autenticata `GET /api/status` del servizio NexusNXS contiene:

```json
{
  "capabilities": {
    "wakeRelay": {
      "protocolVersion": 1,
      "endpoint": "https://relay-host.example.ts.net",
      "pairing": true
    }
  }
}
```

Il client accetta esclusivamente un origin HTTPS radice `*.ts.net` sulla porta standard, senza credenziali, percorso, query o frammento. L'origin e il token `wake` vengono cifrati tramite Android Keystore. L'origin non viene mostrato nell'interfaccia.

Dopo l'associazione il controllo compare soltanto se `GET /api/wake/capabilities`, effettuato con il token del dispositivo, restituisce contemporaneamente:

- `available: true`;
- `requiresConfirmation: true`;
- `arbitraryDestinations: false`;
- almeno un target composto soltanto da `id` e `label` validi.

Il percorso è fisso e fail-closed:

1. `POST /api/pair` con codice monouso e `scope: wake`;
2. `POST /api/wake/plan` con un ID già pubblicato dal relay;
3. anteprima locale di una proposta `risk: high` non scaduta;
4. conferma tramite biometria o PIN di Android;
5. `POST /api/wake/execute` con ticket monouso e `approved: true`;
6. stato “segnale inviato, attendo la workstation” fino a una nuova risposta autenticata del gateway PC.

Un timeout non viene interpretato come successo e il ticket non viene riutilizzato. Un `401` cancella la sessione Wake e richiede una nuova associazione. Un errore di rete conserva soltanto l'ultima capability già autenticata e mostra la riconnessione; un contratto malformato nasconde il controllo.

## Ciò che resta da configurare sul nodo reale

Il client e il relativo APK possono essere compilati senza un nodo Wake, ma una prova end-to-end richiede ancora:

1. un nodo sempre acceso nella LAN con `src/remote/wake-relay.js` e una configurazione locale esclusa da Git;
2. Tailscale Serve HTTPS sul listener loopback del relay, senza Funnel o porte router;
3. il descriptor sopra nello status autenticato del servizio NexusNXS;
4. un codice di associazione creato localmente per l'identità Tailscale del proprietario;
5. Wake-on-LAN abilitato in UEFI, driver Ethernet e alimentazione di standby;
6. test fisici separati da sospensione, ibernazione e arresto.

La versione 1 del relay usa il bearer legato a identità Tailscale e dispositivo. L'eventuale enrollment con chiave hardware e challenge firmata deve essere negoziato da una futura capability versionata del relay: il client non simula una firma che il server non verifica.
