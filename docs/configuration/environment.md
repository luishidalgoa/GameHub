# Environment variables & settings

GameHub reads configuration from two places:

1. **Environment variables** (`.env`, `.env.local`, `.env.production`) — used at
   build/boot, and as **fallbacks**.
2. **Database settings** (Admin → Settings, the `Setting` table) — these
   **override** the matching env var at runtime.

So API keys, S3 endpoints, the shop password, etc. can be set either way; the DB
value wins when present. Operational secrets that must exist at boot
(`SESSION_SECRET`, `ADMIN_PASSWORD`, `DATABASE_URL`) live in env only.

## Environment variables

### Core (required)

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:/data/gamehub.db` (Docker) / `file:./gamehub.db` (local) | SQLite path. Relative paths resolve against `prisma/`. |
| `SESSION_SECRET` | `openssl rand -base64 32` | Signs the admin session JWT. Required. |
| `ADMIN_PASSWORD` | `a-strong-password` | Admin login password. |
| `NEXT_PUBLIC_APP_URL` | `https://games.example.net` | Public base URL (OpenGraph, absolute links). |

### Access control (optional)

| Variable | Purpose |
|---|---|
| `PUBLIC_IP` | If set, requests from this IP get access to the `/admin` UI (in addition to LAN). If unset, IP restriction is skipped. |

### S3 / MinIO (cover storage)

| Variable | Purpose |
|---|---|
| `S3_ENDPOINT_INTERNO` | Internal endpoint the backend uploads to (e.g. `http://minio:9000`). |
| `S3_ENDPOINT_PUBLICO` | Public endpoint (kept for reference; images are served via the same-origin proxy). |
| `S3_BUCKET_NAME` | Bucket (default `gamehub`). |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Credentials. |
| `S3_REGION` | Region (default `us-east-1`; change if MinIO complains). |

### Integrations (optional — can also be set in Admin → Settings)

| Variable | Setting key | Purpose |
|---|---|---|
| `RAWG_API_KEY` | `rawg_api_key` | RAWG metadata (titles, descriptions, screenshots). |
| `STEAMGRIDDB_API_KEY` (or `STEAMGRIDDB_KEY`) | `steamgriddb_key` | SteamGridDB cover art (preferred cover source). |
| `YOUTUBE_API_KEY` | `youtube_api_key` | YouTube trailer search. |
| `GOOGLE_SEARCH_API_KEY` | `google_search_api_key` | Fallback key reused for YouTube if `youtube_api_key` is empty. |
| `BING_IMAGE_KEY` | `bing_image_key` | (Legacy) Bing image search endpoint — not wired into the UI. |
| `METRICS_TOKEN` | `metrics_token` | Bearer token for `/api/metrics`. If unset, the endpoint is **LAN-only**. |

### Docker-managed (set in the image)

`NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `NEXT_TELEMETRY_DISABLED=1`.

## Database settings (Admin → Settings)

Stored in the `Setting` table (`key`/`value`). The UI writes these; they
override env vars. Notable keys:

| Key | Meaning |
|---|---|
| `rawg_api_key`, `steamgriddb_key`, `youtube_api_key`, `google_search_api_key`, `bing_image_key` | Integration keys |
| `app_url` | Public app URL (iframes, shared links) |
| `max_concurrent_downloads` | Max simultaneous ROM downloads before queuing (recommended 1–3 on a Pi) |
| `s3_endpoint_interno`, `s3_endpoint_publico`, `s3_access_key`, `s3_secret_key`, `s3_bucket_name`, `s3_region` | S3/MinIO config |
| `shop_password` | Optional Basic-Auth password for the Switch shop (LAN) |
| `metrics_token` | Bearer token for `/api/metrics` |

Per-platform configuration (scan paths, extensions, scan mode, thumbnail
dimensions, DLC scanning, per-OS emulator links) lives on the `Platform` rows,
also edited in Admin → Settings.

## `.env` files

- `.env.example` — template (committed). Copy to `.env.local` for dev.
- `.env.local` — local dev (git-ignored).
- `.env.production` — production, loaded by `docker-compose` via `env_file`
  (git-ignored).

`scripts/db-import.ts` and `local.ps1` also read `.env`/`.env.local` to pick up
`DATABASE_URL` for CLI operations.
