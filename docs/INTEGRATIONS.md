# Integrazioni future

## Ollama

NEXUS supporta già endpoint OpenAI-compatible locali e discovery tramite
`/models`. L'evoluzione prevista è un provider adapter che separi protocollo,
capability detection, timeout e streaming dal caso d'uso chat.

Non è responsabilità dell'app installare Ollama o scaricare modelli. Il doctor
resta offline; un controllo di connettività futuro dovrà essere esplicito.

## Agents

La futura integrazione richiederà prima:

- manifest e capability per agente;
- tool registry e permission scopes;
- task/run state persistente;
- approval umana per effetti esterni;
- event log, cancellazione e audit.

I nodi agent presenti nella UI sono rappresentazioni prototipali, non agenti
operativi.

