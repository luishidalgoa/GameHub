# Deployment overview

GameHub runs as a Docker container behind Apache (HTTPS) on a Raspberry Pi (or
any Linux host). The repo ships a helper script, `deploy.sh`, that automates the
common operations.

> **The Pi does not build the image.** CI (GitHub Actions) builds the arm64
> image and pushes it to GHCR; the Pi only `docker compose pull`s it. See
> [CI build + GHCR registry](ci-registry.md).

## Topology

```
Internet ──> :443 Apache vhost ──proxy──> 127.0.0.1:3001 ──> container :3000 (Next.js)
                                                              ├─ /data        (SQLite, volume)
                                                              └─ ROM drives   (read-only mounts)
```

## `deploy.sh` (run on the Pi)

```bash
./deploy.sh install        # first deploy on a fresh host (pulls the image)
./deploy.sh update         # git pull (repo files) + docker compose pull + restart — no build
./deploy.sh apache_setup   # configure Apache2 + certbot SSL
./deploy.sh restart        # recreate the container (apply .env.production changes)
./deploy.sh rebuild        # build the image locally (--no-cache) + restart (fallback)
./deploy.sh migrate        # apply pending Prisma migrations in the running container
./deploy.sh logs           # follow container logs
./deploy.sh status         # container status + resource usage
./deploy.sh shell          # shell inside the container
```

`DOMAIN` and `APP_DIR` default in the script but can be overridden via env:

```bash
DOMAIN=games.example.net APP_DIR=/opt/gamehub ./deploy.sh update
```

(Defaults: `DOMAIN` = the configured hostname, `APP_DIR` = `$HOME/services/GameHub`.)

The SQLite DB lives in a Docker volume at `APP_DIR/data` and must be owned by
UID/GID **1001:1001** (the non-root `nextjs` user inside the container).
`deploy.sh install` sets this up. If you ever swap the DB file manually, re-apply
it: `sudo chown -R 1001:1001 "$APP_DIR/data" && sudo chmod -R 775 "$APP_DIR/data"`.

> **Database backup/restore is not in `deploy.sh`** — use `npm run db:export` /
> `npm run db:import` (see [database-migration.md](database-migration.md)).

## Typical first deploy

```bash
git clone https://github.com/luishidalgoa/GameHub.git
cd GameHub
cp .env.production .env.production.local   # or edit in place
nano .env.production                        # set SESSION_SECRET, ADMIN_PASSWORD, S3, …
./deploy.sh install
./deploy.sh apache_setup
```

Then open Admin → Settings and configure scan paths, API keys and the S3/MinIO
endpoints (these can also come from env vars — see
[../configuration/environment.md](../configuration/environment.md)).

## Typical update

```bash
cd "$APP_DIR"
docker compose pull && docker compose up -d --wait
# or:
./deploy.sh update
```

No build runs on the Pi — it just downloads the new image from GHCR (built by
CI). Database migrations run automatically on container start (`prisma migrate
deploy`, see [docker.md](docker.md)). No manual migration step is needed.

## Detail pages

- [CI build + GHCR registry](ci-registry.md) — how the image is built & pulled
- [Docker image, compose, volumes, healthcheck](docker.md)
- [Apache reverse proxy + Let's Encrypt](apache-ssl.md)
- [Moving the database between machines](database-migration.md)
