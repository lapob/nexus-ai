---
title: Container e Docker per sviluppo
type: note
area: development
status: evergreen
level: intermediate
visibility: public
created: 2026-07-28
updated: 2026-08-08
source_kind: curated
tags: [docker, containers, development, reproducibility]
aliases: [Docker per sviluppo]
---

# Container e Docker per sviluppo

## Obiettivo

Un container rende espliciti runtime e dipendenze; non sostituisce test,
configurazione, aggiornamenti o isolamento forte.

## Dockerfile essenziale

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
```

## Checklist

- immagine base mantenuta e versione fissata;
- build multi-stage;
- `.dockerignore` senza secret e artefatti;
- processo non-root;
- filesystem read-only quando possibile;
- niente credenziali in layer, argomenti o environment committed;
- healthcheck coerente con la disponibilità reale;
- limiti di CPU, memoria e processi;
- log su stdout/stderr senza dati sensibili;
- scansione immagine e SBOM;
- aggiornamento e rollback ripetibili.

## Debug

```bash
docker compose config
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs --tail 200 nome-container
docker inspect nome-container
docker stats --no-stream
```

## Collegamenti

- [[05_Risorse/Riferimenti operativi/Comandi Docker e Compose]]
- [[02_Cybersecurity/Cloud Container e DevSecOps/Baseline Kubernetes e supply chain]]
- [[Sicurezza del software]]
- [[Testing e qualita del software]]
