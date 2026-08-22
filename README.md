# NexusNXS public site

Sorgente autorevole del sito pubblico NexusNXS. Produzione e anteprime usano un
solo Cloudflare Worker, `nexusnxs-site`, nell'account che possiede
`nexusnxs.com`. Il progetto non dipende da OpenAI Sites o dall'account ChatGPT.

## Contratto dei domini

- `https://nexusnxs.com`: unico dominio pubblico canonico.
- `https://www.nexusnxs.com`: redirect permanente verso il dominio canonico.
- `https://ai.nexusnxs.com`: servizio AI separato sul Tunnel esistente; il
  rilascio del sito non ne modifica DNS o configurazione.
- Preview Cloudflare: URL versionate dello stesso Worker, senza alias
  `workers.dev` stabile e con `noindex`.

## Requisiti e controlli

- Node.js `>=22.13.0`.
- Credenziale Cloudflare fuori dal repository.
- Per la produzione, Cloudflare Account API Token `nexusnxs-release`, non un
  token personale, limitato a Workers Scripts e Workers Routes per questo
  account e per la sola zona `nexusnxs.com`.

```bash
npm ci --ignore-scripts
npm run check
npm test
npm run verify:security
npm run verify:release
```

`npm run verify:release` è il gate obbligatorio: compatibilità Vinext, firme e
vulnerabilità delle dipendenze, lint, TypeScript, build pulita, test del Worker e
dry-run dell'artefatto Cloudflare. Ogni build elimina prima `dist`, così nessun
metadato di hosting obsoleto può sopravvivere.

## Rilascio controllato

Il bootstrap si esegue una sola volta, senza route e con `workers_dev` spento:

```bash
npm run release:bootstrap
```

Per ogni modifica successiva:

```bash
npm run release:prepare
npm run release:promote
```

`release:prepare` richiede un worktree Git pulito, esegue tutti i gate e carica
una versione candidata con Preview URL. `release:promote` verifica la preview,
promuove esattamente quella versione al 100%, prova il dominio reale e torna
automaticamente alla versione precedente se lo smoke test fallisce.

Rollback operativo esplicito:

```bash
npm run release:rollback -- <version-id>
```

Il token può essere fornito a Wrangler tramite `CLOUDFLARE_API_TOKEN` nel solo
ambiente di rilascio. Non salvarlo in `.env` condivisi, Git, documentazione o
script. L'`account_id` nel `wrangler.jsonc` non è segreto e impedisce di
pubblicare accidentalmente nell'account sbagliato.

## Stati operativi NexusNXS

Caricamento, riconnessione, manutenzione, offline, errore e 404 riusano la
presenza particellare NexusNXS: seed `73`, 104 particelle, palette e curve
NexusFlow. Il service worker conserva soltanto la shell offline e i suoi asset.

La manutenzione si attiva caricando una versione con
`NEXUSNXS_SITE_MODE=maintenance`. Le navigazioni rispondono `503`, mentre
`/status`, API, asset e `security.txt` restano disponibili. Tornare a `live`
richiede una nuova versione verificata; non si crea un secondo progetto.

## Struttura

- `app/`: pagine, componenti, metadata e stile.
- `public/`: asset, shell offline e policy `_headers`.
- `worker/`: ingresso Cloudflare, redirect e intestazioni di sicurezza.
- `scripts/`: pulizia, verifica live e release con rollback.
- `tests/`: rendering, navigazione, hosting e stati operativi.
- `wrangler.jsonc`: identità e configurazione autorevole del Worker.
