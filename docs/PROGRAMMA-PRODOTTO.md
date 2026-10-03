# Programma prodotto e criteri di completamento

Aggiornamento 3 ottobre 2026. Riutilizzare le capacita esistenti; questa mappa
separa implementazione, prove automatiche e prerequisiti esterni.

| Area | Base disponibile | Criterio ancora necessario |
| --- | --- | --- |
| Control e disponibilita | Bridge autenticato, campionamento desktop condiviso, azioni allowlist e ricevute | Finestra di disponibilita sufficiente, boot reale e recupero esterno |
| Intelligenza | Eval lab di 100 casi, provenance, holdout e controlli di isolamento | Dati autorizzati revisionati e confronto misurato; nessun candidato promosso con report sintetici |
| Voce | Sessioni testo/voce, interruzione e percorsi locali; overlay Android oscurato | Corpus umano, microfono/altoparlanti/Bluetooth ed eco reale, rinviati dal proprietario |
| Attivita | Fasi reali in pannello compatto, stop, workflow per passi con ticket e checkpoint | Pausa dell'esecutore durante un passo non e promessa; i passi attendono il consenso e i workflow possono essere annullati |
| Artefatti | Cronologia persistente, originali, diff, confronto, copia ed esportazione del testo | Editor con versioni multiple e sync autenticata richiedono un contratto dati dedicato |
| Comprensione schermo | Allegati volontari e strumenti del workspace | Lettura strutturata della finestra selezionata prima della cattura; indicatore, consenso e nessuna acquisizione continua |
| Integrazioni | Sezioni Connessioni, Permessi, Dispositivi; registro manifest locale fail-closed | Esecutore MCP/plugin reale con isolamento, permessi per chiamata, revoca e prove con connettori selezionati |
| Automazioni | Workflow con checkpoint, ticket monouso e cancellazione; monitor disponibilita | Nodo sempre acceso scelto dal proprietario per n8n; scheduler persistente con scadenze, retry limitati e deduplicazione |
| Grafica | Inter, token comuni, renderer condiviso, reduced motion e profili hardware | Collaudo della nuova build su dispositivi, battery saver e orientamenti; non usare prove di versioni precedenti |
| Pilota commerciale | Gate commerciale e stime di sostenibilita esistenti | Servizio e cliente reali, misure di costi, compiti riusciti, tempo risparmiato, assistenza e politica dati |

## Ordine di lavoro

Prima distribuire soltanto correzioni verificate e rendere i sorgenti
ricostruibili. Poi completare prove umane/dispositivi e audit. Le integrazioni
reali devono attraversare la stessa identita, permessi, cancellazione e
ricevute delle azioni attuali; un manifest non equivale a un plugin eseguibile.

Per il primo pilota, partire da un servizio circoscritto, ad esempio ordinamento
e ricerca di documenti autorizzati, con validazione umana prima di modificare
originali. Registrare conteggio dei compiti, successi verificati, minuti di
assistenza e risorse consumate; non inventare ricavi o metriche di qualita.
Non attivare abbonamenti prima dei gate commerciale, privacy e distribuzione.

PC spento significa runtime locale indisponibile: serve un altro nodo acceso.
Nessun hosting a pagamento o cloud inference viene attivato senza una scelta
del proprietario. La sorgente pubblicata per Codex Cloud rimane distinta
dall'inferenza cloud del prodotto, disattivata per default.
