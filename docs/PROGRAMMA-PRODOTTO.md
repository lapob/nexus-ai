# Programma prodotto e criteri di completamento

Aggiornamento 10 ottobre 2026. Riutilizzare le capacita esistenti; questa mappa
separa implementazione, prove automatiche e prerequisiti esterni.

| Area | Base disponibile | Criterio ancora necessario |
| --- | --- | --- |
| Control e disponibilita | Bridge autenticato, campionamento desktop condiviso, azioni allowlist e ricevute; avvio headless osservato dopo il boot del 10 ottobre | Finestra di disponibilita sufficiente, conferme fisiche finali e recupero da backup esterno; nessun riavvio PC eseguito dal collaudo |
| Intelligenza | Eval lab di 100 casi validati, provenance, holdout e controlli di isolamento | Confronto misurato quick/deep isolato; dataset corrente verificato: zero esempi approvati e zero preferenze, training bloccato |
| Voce | Sessioni testo/voce, interruzione e percorsi locali; overlay Android oscurato; quattro viewport con due turni e cancellazione sintetici verificati | Corpus umano, microfono/altoparlanti/Bluetooth ed eco reale, rinviati dal proprietario; la simulazione non misura comprensione o naturalezza |
| Attivita | Fasi reali in pannello compatto, stop, workflow per passi con ticket e checkpoint | Pausa dell'esecutore durante un passo non e promessa; i passi attendono il consenso e i workflow possono essere annullati |
| Artefatti e memoria | Sorgenti desktop con memoria trasparente, scadenza/esportazione e originale AI con ultime sei copie modificabili; cronologia web locale, recupero al reload e reset fra schede verificati | Distribuire le nuove funzioni desktop e adattare il contratto a web/Android; sync autenticata distinta. Limiti in LOCAL-DATA.md |
| Comprensione schermo | Allegati volontari e strumenti del workspace | Lettura strutturata della finestra selezionata prima della cattura; indicatore, consenso e nessuna acquisizione continua |
| Integrazioni | Sezioni Connessioni, Permessi, Dispositivi; registro manifest locale fail-closed | Esecutore MCP/plugin reale con isolamento, permessi per chiamata, revoca e prove con connettori selezionati |
| Automazioni | Workflow locali con checkpoint, ticket monouso e cancellazione; monitor disponibilita | Scelto il solo percorso locale, senza nodo aggiuntivo; scheduler persistente e integrazione n8n ancora da verificare |
| Grafica | Inter, token comuni, renderer condiviso, reduced motion e profili hardware; Android pubblico114 e Control42 verificati su cinque profili fisici Online il 10 ottobre | Battery saver, richiamo assistente OS e percorsi provider reali restano distinti; installazione manuale Windows29 prima dello smoke installato |
| Distribuzione e sicurezza | Preview29 pubblicata, pacchetti e CI Windows/Ubuntu verificati; recupero cifrato sintetico riuscito | Firme produzione, feed firmato, restore esterno e audit completo; revisione precedente parziale50/930, non certificazione totale |
| Pilota commerciale | Gate commerciale e stime di sostenibilita esistenti | Servizio e cliente reali, misure di costi, compiti riusciti, tempo risparmiato, assistenza e politica dati |

Il controllo aggregato del 10 ottobre ha sei indicatori conformi, nessuno fuori
soglia e tre non misurati: valutazione AI completa, qualita deep e storico di
disponibilita. Non misura la qualita percepita da un umano. La governance della
knowledge verifica provenienza e assenza di duplicati interni; non certifica
la correttezza di ogni contenuto.

I gate Founder e Stable ora accettano anche il BOM UTF-8 dei manifest prodotti
da PowerShell. Le prove Android gia raccolte vengono riconosciute senza
abbassare i requisiti: hash dell'APK, data, stato Online, numero di profili e
metriche di fluidita restano obbligatori. Una prova valida non rende pronta
una distribuzione quando mancano gli altri controlli.

Le radici Braces del sito sono state rimosse sostituendo il livello Vinext/Next
con React/Vite SSR, riusando pagine, font, particelle e confini del Worker.
Il commit website8bd340b supera CI completa,43test e27prove browser; la candidata
immutabile8b4e1ea9 supera14route. Promozione produzione completata tramite il
percorso esistente, versione9580fd57-7a33-4b0f-bc8c-f44703ff8750; controlli dopo
deploy e AIhealth PASS. Il servizio AI si e ripreso automaticamente e readyz
restituisce200. Il runtime gestito usa la policy development-loopback esistente,
distinta dal gate distribuzione: Ollama0.32.15 e il candidato ufficiale0.40.2
restano FAIL con60findingHigh/Critical a granularita modulo. Raggiungibilita e
profilo sicurezza appropriato al gateway pubblico restano da verificare.
Nessuna nuova eccezione, nessun runtime nuovo o modello installato.

Nei sorgenti desktop successivi alla Preview29 sono ora implementati memoria
trasparente con scadenza/esportazione, artefatti con originale AI e ultime6copie,
e una ricetta documenti locale attraversoWorkflowRuntime/ActionRuntime.
Le prove Electron/IPC con profilo sintetico coprono modifica, recupero, consenso
per ogni passo e ricevute. Vedere LOCAL-DATA.md per limiti e conservazione;
non sono nuove funzioni gia distribuite automaticamente a tutti i client.

## Perfezionamenti successivi, dopo i requisiti di distribuzione

1. Un pannello memoria che mostri origine, ambito e scadenza di ogni ricordo,
   permettendo modifica, esportazione e cancellazione comprensibili.
2. Un solo esecutore per plugin e automazioni locali: permessi per chiamata,
   limiti temporali, stop, ricevuta e verifica del risultato. Partire da una
   ricetta su copie di documenti autorizzati, prima di ampliare i connettori.
3. Artefatti modificabili con versioni e ripristino, mantenendo gli originali
   e lo stesso contratto di download su desktop, web e Android.
4. Misure vocali separate per acquisizione, trascrizione, primo token e audio,
   con prove umane di interruzione ed eco prima di ottimizzare il percorso.
5. Un pilota circoscritto con esiti verificati e risorse misurate. Nuovi modelli
   soltanto dopo dati autorizzati e confronto isolato con la baseline.

Sono proposte di sviluppo: non risultano tutte implementate. MCP offre un
contratto comune per gli strumenti, ma non sostituisce isolamento e permessi;
le [guide OpenAI](https://openai.github.io/openai-agents-python/mcp/) e
[Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
sono riferimenti per l'integrazione, non una scelta di inferenza cloud.

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

Il proprietario ha scelto il percorso locale, senza un altro nodo disponibile.
Non attivare hosting, relay remoto o cloud inference. Preparare le integrazioni
con il servizio locale esistente e conservarne identita, ticket, revoca e
ricevute; n8n deve restare disattivato finche il collegamento reale non supera
le prove di autorizzazione, cancellazione e deduplicazione. Non esporre un
webhook anonimo alle operazioni del PC e non riutilizzare token privati nei
workflow pubblicati. Un workflow approvato non autorizza azioni successive
con permessi diversi. PC spento significa runtime locale indisponibile.
Per operare in quel caso servirebbe un altro nodo acceso.
Nessun hosting a pagamento o cloud inference viene attivato senza una scelta
del proprietario. La sorgente pubblicata per Codex Cloud rimane distinta
dall'inferenza cloud del prodotto, disattivata per default.
