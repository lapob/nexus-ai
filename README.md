# NexusNXS public site

Sito ufficiale di NexusNXS per PC e NexusNXS per Android, costruito con vinext
e pubblicato tramite OpenAI Sites.

## Requisiti

- Node.js `>=22.13.0`

## Comandi

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
```

## Struttura

- `app/`: pagine, componenti, metadata e stile.
- `public/`: logo, font Inter e immagine social ufficiale.
- `worker/`: ingresso Cloudflare e intestazioni di sicurezza.
- `tests/`: controlli sul rendering e sui metadata di produzione.
- `.openai/hosting.json`: associazione al progetto Sites.

Il sito pubblico non richiede database, autenticazione applicativa o storage
persistente. Gli artefatti di build e le dipendenze locali sono ignorati da Git
e possono essere rigenerati con `npm install` e `npm test`.

## Stati operativi NexusNXS

Caricamento, riconnessione, manutenzione, offline, errore e 404 riusano la
presenza particellare dell'app NexusNXS: seed `73`, 104 particelle, palette e
curve NexusFlow. Il service worker salva soltanto la shell offline e i suoi
asset; non conserva copie delle normali pagine o delle API.

La manutenzione programmata si attiva sullo stesso progetto impostando
`NEXUSNXS_SITE_MODE=maintenance`. Le navigazioni HTML rispondono `503`, mentre
`/status`, le API, gli asset e `security.txt` restano raggiungibili. Rimuovere la
variabile (o impostarla a `live`) ripristina il sito senza creare altri progetti.

La navbar è definita una sola volta nel layout e usa navigazioni complete: in
produzione il service worker può quindi mostrare la shell NexusNXS anche quando
la rete cade. Il service worker è disattivato e rimosso automaticamente su
`localhost`, per evitare anteprime ferme in cache quando il server di sviluppo
viene chiuso.

`npm test` è il gate unico della release: esegue lint, controllo TypeScript,
build, verifica di tutte le pagine pubbliche, link della navbar, redirect,
manutenzione, 404 e asset offline.
