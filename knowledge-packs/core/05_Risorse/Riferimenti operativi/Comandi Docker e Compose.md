---
title: Comandi Docker e Compose
type: reference
area: resources
status: evergreen
level: intermediate
visibility: public
created: 2026-07-23
updated: 2026-07-23
source_kind: curated
tags: [docker, containers, compose, commands]
aliases: [Docker Commands]
---

# Comandi Docker e Compose

## Immagini

```bash
docker image ls
docker pull nome:tag
docker build -t nome:tag .
docker image inspect nome:tag
docker history nome:tag
```

Usa tag o digest espliciti; verifica origine, Dockerfile e dipendenze.

## Container

```bash
docker container ls
docker container ls -a
docker run --rm nome:tag
docker run --rm -p 127.0.0.1:8080:8080 nome:tag
docker logs nome-container
docker logs --follow nome-container
docker inspect nome-container
docker stats
docker stop nome-container
```

Evita `--privileged`, mount del socket Docker e binding su tutte le interfacce se non necessari.

## Debug

```bash
docker exec -it nome-container sh
docker top nome-container
docker port nome-container
docker diff nome-container
docker cp nome-container:/percorso/file .
```

## Volumi e reti

```bash
docker volume ls
docker volume inspect nome-volume
docker network ls
docker network inspect nome-rete
```

Le operazioni di prune o rimozione possono cancellare dati. Inventaria target e backup prima di usarle.

## Compose

```bash
docker compose config
docker compose pull
docker compose build
docker compose up
docker compose up -d
docker compose ps
docker compose logs --follow
docker compose down
```

`docker compose down -v` rimuove anche i volumi: non usarlo senza aver verificato il contenuto persistente.

## Collegamenti

- [[02_Cybersecurity/Cloud Container e DevSecOps/Indice - Cloud Container e DevSecOps|Cloud, container e DevSecOps]]
