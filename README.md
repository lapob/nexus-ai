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
