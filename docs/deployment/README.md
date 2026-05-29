# Deployment overview

GameHub runs as a Docker container behind Apache (HTTPS) on a Raspberry Pi (or
any Linux host). The repo ships a helper script, `deploy.sh`, that automates the
common operations.

## Topology

```
Internet ──> :443 Apache vhost ──proxy──> 127.0.0.1:3001 ──> container :3000 (Next.js)
                                                              ├─ /data        (SQLite, volume)
                                                              └─ ROM drives   (read-only mounts)
```

## `deploy.sh` (run on the Pi)

```bash
./deploy.sh install        # first deploy on a fresh host
./deploy.sh update         # git pull + rebuild + restart (zero-ish downtime)
./deploy.sh apache_setup   # configure Apache2 + certbot SSL
./deploy.sh db_export      # back up the live DB to the current folder
./deploy.sh db_import      # import a .db file into the live DB (+ permissions)
./deploy.sh logs           # follow container logs
./deploy.sh status         # container status + resource usage
```

`deploy.sh` uses two constants at the top of the file — adjust them for your host:

- `DOMAIN` — the public hostname served by Apache.
- `APP_DIR` — where the app lives on the host (default `/home/<user>/services/GameHub`).

The SQLite DB lives in a Docker volume at `APP_DIR/data` and must be owned by
UID/GID **1001:1001** (the non-root `nextjs` user inside the container).
`deploy.sh install` sets this up; `db_import` re-applies it.

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
git pull && docker compose up -d --build
# or:
./deploy.sh update
```

Database migrations run automatically on container start (`prisma migrate
deploy`, see [docker.md](docker.md)). No manual migration step is needed.

## Detail pages

- [Docker image, compose, volumes, healthcheck](docker.md)
- [Apache reverse proxy + Let's Encrypt](apache-ssl.md)
- [Moving the database between machines](database-migration.md)
