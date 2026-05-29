# Docker & compose

> In production the image is **built by CI and pulled from GHCR** — the Pi does
> not build. This page documents the image/compose internals; see
> [ci-registry.md](ci-registry.md) for the build-and-publish flow. Local builds
> (`docker compose build` / `./deploy.sh rebuild`) remain available as a fallback.

## Image (`Dockerfile`)

Multi-stage build producing a Next.js **standalone** image:

1. **deps** — `npm ci --legacy-peer-deps` with build tools for native addons
   (`better-sqlite3`, `sharp`) and `openssl` for Prisma.
2. **builder** — `npx prisma generate` + `npm run build`.
3. **runner** — copies `.next/standalone`, `.next/static`, `public`, the Prisma
   schema + migrations + client, and the `sharp` binaries. Runs as non-root
   user `nextjs` (UID/GID 1001).

Startup command:

```sh
node node_modules/prisma/build/index.js migrate deploy && node server.js
```

→ **Pending migrations are applied automatically on every container start.**
Adding a new migration folder under `prisma/migrations/` is all that's needed;
it runs on the next deploy.

Runtime env baked into the image: `NODE_ENV=production`, `PORT=3000`,
`HOSTNAME=0.0.0.0`, `NEXT_TELEMETRY_DISABLED=1`.

## `docker-compose.yml`

> The compose file is environment-specific (ports, drive mounts) and is
> **git-ignored** so a `git pull` never overwrites the host's version. Keep your
> real one on the Pi.

Key parts:

```yaml
services:
  gamehub:
    build: { context: ., dockerfile: Dockerfile }
    container_name: gamehub
    restart: unless-stopped
    env_file: .env.production
    ports:
      - "3001:3000"            # host:container — Apache proxies to host 3001
    volumes:
      - ./data:/data           # SQLite DB (DATABASE_URL=file:/data/gamehub.db)
      - /mnt/F:/mnt/F:ro       # ROM drive(s), read-only — adjust to your mounts
      - /mnt/nextcloud_hdd_1:/mnt/nextcloud_hdd_1:ro
    stop_grace_period: 30s     # let SQLite flush + in-flight requests finish
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/auth/me >/dev/null 2>&1 || exit 1"]
```

Notes:

- **ROM drives are mounted read-only** at the same path inside the container as
  on the host, so the scan paths you configure in Admin → Settings match 1:1.
- **Healthcheck uses `127.0.0.1`, not `localhost`** — inside Alpine `localhost`
  can resolve to IPv6 `::1` while Next.js listens on IPv4, which would report the
  container unhealthy.
- `docker compose up -d --wait` blocks until the healthcheck passes, so a deploy
  only returns once the new container is actually serving.

## DATABASE_URL & the data volume

- In the container: `DATABASE_URL="file:/data/gamehub.db"` (set in
  `.env.production`), and `/data` is the `./data` volume.
- The volume must be owned by `1001:1001` (the `nextjs` user). If you see Prisma
  permission errors, run:
  ```bash
  sudo chown -R 1001:1001 "$APP_DIR/data" && sudo chmod -R 775 "$APP_DIR/data"
  ```

## Common commands

```bash
docker compose build
docker compose up -d --wait
docker compose logs -f --tail=50 gamehub
docker compose ps
docker compose stop gamehub        # before manually swapping the DB file
```
