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
  `workers.dev` di produzione. L'alias temporaneo `candidate` è intenzionale,
  appartiene alla singola versione ed è sempre `noindex`.

## Requisiti e controlli

- Node.js `>=22.13.0`.
- Credenziale Cloudflare fuori dal repository.
- Per la produzione, Cloudflare Account API Token `nexusnxs-release`, non un
  token personale, limitato a Workers Scripts e Workers Routes per questo
  account e per la sola zona `nexusnxs.com`.

In locale la credenziale viene conservata dal sistema operativo (Gestore
credenziali di Windows, Keychain o Secret Service), mai in un file del progetto:

```bash
npm run cloudflare:credential:store
npm run cloudflare:credential:status
```

In CI si usa invece il secret protetto `CLOUDFLARE_API_TOKEN`; l'ambiente ha
precedenza sul keyring. Il token viene inoltrato soltanto ai processi Wrangler e
alle chiamate Cloudflare necessarie, non a npm, test o Git.

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

`npm ci --ignore-scripts` appartiene alla preparazione dell'ambiente o alla CI,
non alla promozione: la release valida l'albero installato con `npm ls` senza
sostituire moduli mentre un server locale può essere in esecuzione.

## Rilascio controllato

Il primo trasferimento usa fasi separate. Il bootstrap si esegue una sola volta,
senza route e con `workers_dev` spento:

```bash
npm run release:bootstrap
```

Dopo il bootstrap si aggiungono al contratto `wrangler.jsonc` esclusivamente i
Custom Domains `nexusnxs.com` e `www.nexusnxs.com`, si committa la modifica e si
prepara la candidata. L'ID della versione viene esposto come
`X-NexusNXS-Worker-Version`, così preview e dominio devono provare di servire
esattamente lo stesso artefatto:

```bash
npm run release:prepare
npm run release:activate-initial
```

Solo dopo la rimozione controllata dei vecchi record Sites di `www` e apex:

```bash
npm run release:cutover -- --confirm-domain-cutover
```

Il cutover collega prima `www`, poi l'apex, allo stesso Worker. Non modifica
`ai.nexusnxs.com`; la sua salute viene verificata come gate indipendente e un
suo guasto non provoca rollback del sito pubblico.

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

Non salvare mai il token in `.env`, Git, documentazione o script.
L'`account_id` nel `wrangler.jsonc` non è segreto e impedisce di pubblicare
accidentalmente nell'account sbagliato.

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
