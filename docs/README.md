# GameHub — Technical Wiki

Technical documentation for **GameHub**, a self-hosted personal game library
(Switch, 3DS, NDS, Wii, PSP, PS Vita…) with metadata enrichment, cover art,
download queue, a Tinfoil/DBI-compatible Switch shop, and Prometheus metrics.

> For a 5-minute "get it running locally" guide, see the root [`README.md`](../README.md).
> This wiki is the **technical reference** for operating and extending the project.

## Contents

### Architecture
- [Architecture overview](architecture.md) — stack, request flow, directory map

### Deployment
- [Deployment overview](deployment/README.md) — Raspberry Pi + Docker + Apache
- [Docker & compose](deployment/docker.md) — image, volumes, healthcheck, `deploy.sh`
- [Apache reverse proxy + SSL](deployment/apache-ssl.md)
- [Moving the database between machines](deployment/database-migration.md) — `db:export` / `db:import` + path remap

### Configuration
- [Environment variables & settings](configuration/environment.md) — every env var and DB setting

### Features
- [Scanner](features/scanner.md) — scan modes, Title-ID linking, multi-disc unification
- [Covers & metadata](features/covers-metadata.md) — RAWG + SteamGridDB, cover proxy, crop, auto-metadata + trailers
- [Downloads & queue](features/downloads-queue.md) — token queue, range/resume, streaming
- [Switch shop API](features/switch-shop.md) — Tinfoil / DBI / CyberFoil, **how to connect**

### Observability
- [Metrics, Prometheus & Grafana](observability/metrics-grafana.md) — `/api/metrics`, scrape config, node_exporter

### Reference
- [Database schema](reference/database.md) — Prisma models
- [API reference](reference/api.md) — endpoints

## TL;DR for operators

| I want to… | Go to |
|---|---|
| Deploy / update on the Pi | [deployment/docker.md](deployment/docker.md) → `./deploy.sh update` |
| Configure API keys, S3, ports | [configuration/environment.md](configuration/environment.md) (or Admin → Settings) |
| Plug GameHub into Prometheus/Grafana | [observability/metrics-grafana.md](observability/metrics-grafana.md) |
| Connect a Switch (Tinfoil/DBI) | [features/switch-shop.md](features/switch-shop.md) |
| Move my library to another PC | [deployment/database-migration.md](deployment/database-migration.md) |
