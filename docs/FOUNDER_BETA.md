# NexusNXS Founder Beta

## Prodotto vendibile

NexusNXS non viene presentato come un'altra chat generica. Il risultato da
vendere e il tempo risparmiato da un assistente personale che comprende una
richiesta, prepara il lavoro e agisce sul computer soltanto entro autorizzazioni
chiare, verificabili e revocabili.

I primi flussi da dimostrare sono:

1. continuare dal telefono un'attivita iniziata sul PC;
2. creare o modificare un progetto mostrando anteprima, ricevuta e annullamento;
3. organizzare file e applicazioni dentro uno spazio esplicitamente scelto;
4. riprendere il contesto senza esporre una cronologia obbligatoria.

## Percorso commerciale

La prima fase e una lista di interesse senza checkout. La Founder Beta puo
aprire a un massimo di 20 persone con un obiettivo di 69 EUR per il primo anno,
ma prezzo finale, quote, rinnovo, disdetta e condizioni devono essere mostrati
prima dell'acquisto. Non sono ammessi piani illimitati.

Il percorso previsto e:

1. 20-30 tester gratuiti e osservazione dei flussi reali;
2. Founder Beta limitata, con supporto diretto e quote conservative;
3. Pro a 12,99 EUR/mese soltanto dopo disponibilita e margine misurati;
4. Power a 24,99 EUR/mese per budget e workflow superiori;
5. offerta Team soltanto dopo la maturita del prodotto individuale.

## Metriche di decisione

Prima di accettare pagamenti vengono misurati utenti concorrenti, tempo al primo
contenuto, latenza p95, profondita della coda, consumo per richiesta, minuti
voce, richieste di assistenza, rimborsi e disponibilita su 30 giorni. Il margine
lordo obiettivo e almeno il 70%, calcolato dopo commissioni di pagamento e costi
operativi diretti.

La metrica prodotto principale e il tempo verificabile risparmiato ogni
settimana. Attivazione, ritorno settimanale, completamento delle attivita e tasso
di errori hanno precedenza su download e visite al sito.

## Confini di fiducia

- Le conversazioni non diventano automaticamente dati di addestramento.
- Il contributo al miglioramento richiede consenso separato e revocabile.
- La diagnostica non conserva prompt, file, percorsi o identificativi in chiaro.
- Ogni azione sensibile conserva anteprima, ambito, esito e possibilita di
  recupero quando tecnicamente possibile.
- Checkout, fiscale, condizioni, assistenza e rimborsi richiedono revisione
  professionale prima dell'apertura.

`npm run commercial:check` produce il report informativo. Il comando
`npm run commercial:gate` resta rosso finche gli SLO e tutti i controlli esterni
non dimostrano che sia corretto accettare pagamenti.

## Gate operativo

`npm run founder:check` separa due risultati che non devono essere confusi:

- **Preview tecnica pronta**: AI, voce, endpoint pubblici, backup e movimento
  hanno evidenze automatiche recenti;
- **Founder Beta pronta**: oltre alla Preview, installer e distinte sono firmati,
  entrambe le app Android sono state provate sulla matrice fisica e privacy e
  assistenza hanno un responsabile confermato.

`npm run founder:gate` fallisce finche ogni prova necessaria agli inviti reali
non e presente. Il report vive in `qa-artifacts/founder-beta-readiness.json` e
non contiene prompt, risposte, indirizzi, percorsi o identita dei tester.

## Pacchetto per amici

`npm run founder:package` verifica la distinta Preview e prepara
`artifacts/founder-preview` con il solo installer Windows pubblico, il solo APK
Android pubblico, checksum e istruzioni di installazione e segnalazione. La
Console privata, configurazioni, log, SBOM operativa e dati della workstation
non possono entrare nel pacchetto. Il comando rifiuta anche un artefatto dal
nome ambiguo, pur se marcato erroneamente come pubblico.
