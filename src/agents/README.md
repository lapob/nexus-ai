# Agents

`action-runtime.js` contiene il confine operativo delle azioni locali:

- catalogo delle capability consentite;
- validazione di app, comandi, script e percorsi;
- anteprima leggibile;
- ticket monouso con scadenza;
- consenso nativo prima dell'esecuzione;
- audit locale minimale.

`agent-loop.js` è il ciclo agentico pianifica → agisci → osserva:

- function calling nativo del provider (`tools` / `toolCalls`), fino a 5 passi
  e 3 chiamate per passo;
- argomenti validati contro lo schema JSON di `typed-tools.js` prima
  dell'esecuzione; errori restituiti al modello per correggersi;
- consenso richiesto tramite callback per ogni strumento sensibile: senza
  callback o con rifiuto lo strumento non viene eseguito;
- risultati marcati come dati non fidati, chiamate identiche non rieseguite,
  timeout per strumento e annullamento propagato;
- ripiego su chat diretta se il modello non supporta strumenti.

`core-tools.js` registra `current-time`, `calculate`, `date-diff` e, solo se il
servizio è iniettato, `search-knowledge` e `web-search`.

`tool-output-guard.js` sostituisce, prima che il modello le legga, le frasi dei
risultati che istruiscono l'assistente (prefissi di ruolo, "istruzione per
l'assistente", override, imperativi che nominano strumenti del registro).
Marcarle come non fidate non bastava: il modello le riferiva all'utente.

Le regole in `AGENT_GUIDANCE` e la data corrente nel system derivano dagli
errori misurati con la suite `config/evals/nexusnxs-agent-v1.json`.

`CONSENT:` una risposta del modello non equivale mai a un'autorizzazione.
