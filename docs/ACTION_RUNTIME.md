# Runtime azioni e consenso

NEXUSNXS dispone di un primo runtime operativo locale. Il modello non esegue
direttamente strumenti: trasforma una richiesta in una singola proposta JSON,
che viene validata nel processo principale prima di diventare un ticket.

## Flusso

```text
Persona -> richiesta -> modello locale -> proposta JSON
       -> validazione main process -> ticket monouso (5 minuti)
       -> dialogo nativo Electron -> autorizza/annulla
       -> esecuzione -> audit locale minimale
```

Il renderer non riceve filesystem, `child_process`, `shell` o `ipcRenderer`.
Espone soltanto tre operazioni IPC: catalogo capacità, pianificazione e consumo
di un ticket. Un ticket viene rimosso prima dell'esecuzione e non è riutilizzabile.

## Strumenti iniziali

- `open_application`: applicazioni note mappate per Windows, macOS e Linux;
- `open_path`: file o cartelle esistenti all'interno della vault;
- `run_script`: `.js`, `.mjs`, `.cjs`, `.py`, `.ps1` e `.sh` nella vault;
- `run_command`: script npm dichiarati, con argomenti separati e `shell: false`;
- `list_directory`, `read_file`, `write_file`: operazioni confinate alla cartella
  di lavoro attiva, con checkpoint prima di ogni scrittura.
- `write_files`: crea fino a venti file annidati con una sola autorizzazione,
  verifica ogni contenuto e consente il ripristino dell'intera attività;
- `create_directory`, `copy_path`, `move_path`, `trash_path`: gestione confinata
  della struttura; le eliminazioni usano il cestino del sistema.

Percorsi lessicali e reali devono restare nella vault, così symlink e traversal
non possono uscire dal confine. Gli interpreti sono accessibili soltanto tramite
`run_script`; `run_command` accetta esclusivamente `npm run <script>`.
I processi figli ricevono un ambiente ridotto alle variabili operative:
credenziali, token e chiavi API dell'app non vengono ereditati automaticamente.

## Cancellazione remota

Il client Console genera un UUID v4 prima di autorizzare un'azione e lo invia
come `operationId` insieme al ticket:

```http
POST /api/actions/execute
Authorization: Bearer <token-console>
Content-Type: application/json

{"ticketId":"...","approved":true,"operationId":"<uuid-v4>"}
```

Per interrompere l'attività ancora in corso lo stesso dispositivo chiama:

```http
POST /api/actions/cancel
Authorization: Bearer <stesso-token-console>
Content-Type: application/json

{"operationId":"<stesso-uuid-v4>"}
```

Il gateway risponde `202` quando la richiesta di cancellazione viene inoltrata.
Un dispositivo diverso riceve `404`, anche se conosce l'identificatore, e un
token privo dello scope Console riceve `403`. La chiusura della connessione di
esecuzione, la revoca del dispositivo e l'arresto del gateway propagano lo
stesso `AbortSignal`. Per `run_script` e `run_command` il runtime termina l'intero
albero di processi posseduto; l'output successivo alla cancellazione viene
scartato.

La cancellazione non è un rollback. Una scrittura, copia, rinomina, apertura di
applicazione o altra operazione sincrona già completata resta valida e deve
essere eventualmente annullata tramite i checkpoint disponibili. Le azioni di
spegnimento e riavvio usano un endpoint separato e non sono cancellabili con
`/api/actions/cancel`.

## Consenso

La policy scelta nelle impostazioni decide quando il renderer mostra il
consenso: **Chiedi sempre**, **Automatico** per le sole azioni ad alto rischio,
oppure **Accesso completo** entro gli strumenti e i percorsi consentiti.
I ticket restano monouso, scadono dopo cinque minuti e vengono sempre validati
nel processo principale. Nessuna modalità può aggirare catalogo applicazioni,
confini dei percorsi o blocco dei comandi non consentiti.

Questa garanzia presuppone che la sessione del sistema appartenga alla persona
che sta usando NEXUSNXS. Il software non può verificare identità biometrica o legale.

## Audit

L'audit JSONL vive in `userData/data/logs/action-audit.jsonl` e registra:

- approvazione o rifiuto;
- strumento e anteprima mostrata;
- completamento, codice di uscita o errore.

Stdout e stderr vengono mostrati nella sessione, ma non archiviati nell'audit.

## Artefatti nella conversazione

Un'azione completata può restituire un artefatto operativo sanitizzato. La chat
mostra un riepilogo compatto con file modificati e conteggio delle righe, mentre
il dettaglio apribile contiene codice evidenziato, numeri di riga, una vista
unificata o affiancata prima/dopo e la timeline degli eventi verificati. Gli
artefatti derivano dal risultato reale del runtime, non dal
testo generato dal modello, e vengono conservati insieme al turno nella
cronologia locale. Percorsi assoluti e ambiente del processo non sono inclusi;
contenuti e output sono limitati a 48 KiB per artefatto.
Gli errori che indicano un file nello spazio di lavoro diventano riferimenti
file/riga consultabili; ogni percorso esterno allo spazio autorizzato viene
scartato prima di raggiungere l'interfaccia.

I workflow multi-file assegnano lo stesso identificatore transazionale a tutti
i checkpoint. Un ripristino dell'attività applica i checkpoint in ordine inverso
e non coinvolge file estranei. Dopo ogni scrittura il runtime rilegge il file e,
per JSON, valida anche la sintassi prima di dichiarare il completamento.

Il client Android conserva gli artefatti come metadati cifrati nel database
privato e li mostra con componenti Compose nativi; nessun contenuto viene
trasformato in una pagina web o inserito nelle notifiche.

Titoli, percorsi e provenienza della knowledge privata non vengono inviati alle
superfici pubbliche. Il recupero resta un supporto interno al prompt; la UI
mostra soltanto risposta e risultati operativi relativi alla cartella scelta.

## Limiti intenzionali

- una sola azione per proposta;
- nessuna automazione pianificata o autonoma;
- nessun controllo GUI tramite coordinate, accessibilità o screen reading;
- nessun download o browser remoto; Ollama resta loopback o LAN privata autorizzata;
- nessun permesso permanente;
- nessun isolamento OS aggiuntivo oltre ai privilegi dell'account corrente.

Prima di ampliare il catalogo servono manifest di plugin firmabili e test
specifici per sistema.
