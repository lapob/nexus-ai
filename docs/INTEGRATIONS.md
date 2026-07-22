# Integrazioni

## Runtime AI e Ollama

NEXUS usa un runtime indipendente dal provider. La prima implementazione è
`OllamaProvider`, basata sulle API native locali `/api/version`, `/api/tags`,
`/api/chat` e `/api/embed`. Il renderer non conosce endpoint e non può accedere
alla rete: chat, health, modelli, streaming, cancellazione ed embedding passano
da API preload esplicite e handler IPC validati.

Ollama non viene installato dall'app e nessun modello viene scaricato
automaticamente. Il doctor resta offline; `CHECK RUNTIME` esegue un health check
esplicito. La verifica con una installazione Ollama reale è ancora da eseguire.

Documentazione ufficiale: https://docs.ollama.com/api/introduction

## Agents

Gli agenti restano fuori da questa fase. Serviranno manifest di capability,
permission scope, stato persistente, approvazione umana, audit e tool registry.
