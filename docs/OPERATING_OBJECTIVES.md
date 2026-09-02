# Operating objectives

NexusNXS usa `config/product-slo.json` come unica policy misurabile per qualita,
latenza, voce, gateway e fluidita. `npm run slo:check` aggrega soltanto dati
tecnici senza prompt, risposte, token, indirizzi o identificatori personali.

La disponibilita a 30 giorni non viene dedotta da un singolo health check. Il
report la indica come `not-measured` finche un monitor periodico non produce una
serie storica. La readiness pubblica e invece un controllo puntuale separato.

Il monitor operativo privato resta `npm run server:dashboard`; non viene
aggiunta una seconda dashboard pubblica. Il comando `npm run control:status`
fornisce una fotografia singola e `npm run slo:gate` blocca una release quando
una prova locale obbligatoria e assente o fuori soglia.

## Sicurezza verificabile

`npm run security:asvs` controlla la mappa di prove in
`config/asvs-5-controls.json`. E un inventario interno per capitolo verso OWASP
ASVS 5.0: non sostituisce la verifica dei singoli requisiti ne una certificazione.
I capitoli non applicabili devono avere una motivazione esplicita.
`npm run tailscale:policy:check` valida il modello Grants;
la variante `tailscale:policy:gate` richiede una policy attiva senza placeholder.

Tailnet Lock va abilitato soltanto dopo aver registrato piu chiavi di firma,
salvato le chiavi di recupero offline e verificato un secondo dispositivo
amministrativo. L'attivazione automatica e intenzionalmente esclusa per evitare
di bloccare la workstation. Device posture e Grants vanno applicati nella
console Tailscale, quindi la policy esportata va verificata localmente con
`--file=<percorso>`.
# Budget d'errore

Il report di disponibilità espone anche il budget d'errore: percentuale
consumata, residuo e burn rate rispetto all'obiettivo. Il dato diventa un SLO
misurato soltanto dopo aver raggiunto campioni e copertura temporale minimi;
prima di allora resta esplicitamente `not-measured` e non viene presentato come
affidabilità storica dimostrata.
