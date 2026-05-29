# Architecture overview

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, `tailwindcss-animate`, lucide-react icons |
| i18n | `next-intl` (Spanish / English, see `messages/`) |
| Database | SQLite via Prisma ORM (`prisma/schema.prisma`) |
| Cover storage | MinIO / S3-compatible object storage (AWS SDK v3) |
| Charts | Recharts (admin traffic dashboard) |
| Runtime | Node.js 20 (Docker `node:20-alpine`), `output: 'standalone'` |
| Reverse proxy | Apache2 + Let's Encrypt (certbot) on the host |

The app is designed to run on a **Raspberry Pi** with ROM files on local/attached
drives, behind Apache for HTTPS.

## Key principle: the DB is the source of truth

Scan paths, platforms, API keys, S3 config and the shop password are read from
the **database** (Admin → Settings) — env vars are only fallbacks/defaults.
Nothing operational (IPs, domains, paths) is hardcoded in source.

DB `Setting` values **override** the equivalent environment variable at runtime.

## Request flow (production)

```
Browser ──HTTPS──> Apache (:443, vhost)
                     │  ProxyPass / → http://127.0.0.1:3001
                     │  sets X-Real-IP, X-Forwarded-Proto=https
                     ▼
            Next.js standalone server (container :3000, host :3001)
                     │
        ┌────────────┼─────────────────────────┐
        ▼            ▼                           ▼
   SQLite (/data)  MinIO/S3 (covers)      Local ROM drives (read-only mounts)
```

- The container listens on `:3000`; `docker-compose` maps it to host `:3001`;
  Apache proxies the public domain to `127.0.0.1:3001`.
- `middleware.ts` gates `/admin` pages and mutating API routes (auth + IP).
- Cover images are served same-origin through `/api/covers/proxy/...` so the
  browser never talks to MinIO directly (avoids mixed-content over HTTPS).

## Directory map

```
src/
  app/                      # App Router pages + API routes
    api/                    # Route handlers (REST/SSE)
      covers/proxy/         #   same-origin cover image proxy
      download/             #   queued ROM downloads (range/resume)
      metrics/              #   Prometheus exporter  (see observability/)
      scanner/              #   scan trigger + SSE stream
      shop/                 #   Tinfoil/DBI Switch shop
      metadata/, games/, platforms/, settings/, admin/…
    platform/[slug]/        # platform game grid (infinite scroll)
    game/[id]/              # full game page
    admin/                  # dashboard, settings, traffic, games, graveyard…
  components/               # layout, platform, game, admin, shared UI
  lib/
    scanner/                # walker, index (scan engine), titleid, events
    metadata/               # rawg, steamgriddb, batch, auto, provider
    s3.ts, cover-url.ts     # cover storage + URL resolution
    download-queue.ts       # DB-backed download token queue
    auth.ts, tracker.ts, traffic.ts, hash.ts, db.ts
prisma/                     # schema + migrations + sqlite db
scripts/                    # tsx scripts: scan, seed, db-export, db-import
apache2/                    # vhost templates (HTTP + HTTPS)
deploy.sh                   # Pi deploy/update/apache/db helper (bash)
local.ps1                   # Windows dev helper (PowerShell)
docker-compose.yml, Dockerfile
messages/                   # i18n (es.json, en.json)
```

## Subsystems

- **Scanner** — discovers ROMs on disk and upserts `Game`/`GameDlc` rows.
  See [features/scanner.md](features/scanner.md).
- **Metadata & covers** — RAWG (metadata) + SteamGridDB (cover art) + the
  cover proxy/crop pipeline. See [features/covers-metadata.md](features/covers-metadata.md).
- **Downloads** — a DB-backed token queue + range-request streaming.
  See [features/downloads-queue.md](features/downloads-queue.md).
- **Switch shop** — a Tinfoil/DBI HTTP index over the Switch library.
  See [features/switch-shop.md](features/switch-shop.md).
- **Observability** — Prometheus `/api/metrics` + the `/admin/traffic`
  dashboard. See [observability/metrics-grafana.md](observability/metrics-grafana.md).
