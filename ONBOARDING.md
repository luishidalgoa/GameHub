# GameHub — Project Context

## What is GameHub?

A **self-hosted ROM library** running on a Raspberry Pi. Users can browse games by platform, download them, watch trailers, and a Nintendo Switch shop endpoint (CyberFoil/Tinfoil-compatible) exposes the library as a "shop" installable directly from the console.

The admin can scan new ROMs, edit game metadata, upload cover art, and manage settings — all through a web UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router (TypeScript) |
| Database | SQLite via Prisma + `better-sqlite3` |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Custom JWT session (cookie `gamehub_session`) |
| Storage | MinIO (S3-compatible) for cover art |
| Image processing | `sharp` |
| i18n | `next-intl` (en / es) |
| Deployment | Docker on Raspberry Pi + Apache2 reverse proxy (HTTPS) |

---

## Repository Layout

```
src/
  app/                     # Next.js App Router pages + API routes
    (public)/              # Public-facing pages (library, game detail)
    admin/                 # Admin pages (settings, game editor, graveyard)
    api/
      auth/                # login / logout / me / is-admin-ip
      covers/              # POST upload, GET proxy (MinIO → browser), SteamGridDB, Google Images
      admin/
        s3-test/           # MinIO connectivity diagnostic (admin session required)
        graveyard/         # Stale game management
        fs/browse/         # Server-side folder picker for scan paths
        traffic/           # Analytics
        donations/         # Donation CRUD
        metadata/batch/    # Bulk metadata fetch
      games/               # GET/PATCH/DELETE individual game
      scanner/             # POST trigger scan, GET stream (SSE)
      shop/                # CyberFoil/Tinfoil endpoints (route, dlc, updates, debug)
      download/            # Queued download for browser
      queue/               # Download queue status + token polling
      platforms/           # Platform CRUD
      settings/            # Key-value settings CRUD
      metadata/            # RAWG metadata fetch per game
      search/              # Full-text game search
  lib/
    auth.ts                # JWT, session cookie, isLanIp, isAdminSession
    s3.ts                  # MinIO client, resolveCoverPath, uploadCoverToS3
    covers.ts              # saveCoverFromBuffer (sharp processing)
    db.ts                  # Prisma singleton
    download-queue.ts      # In-memory download queue
    scanner/
      index.ts             # Scanner orchestrator (reads platforms from DB)
      walker.ts            # File system walkers (flat, folder, ports)
      platforms.ts         # Seed-only config — NOT used at runtime
  components/
    admin/
      SettingsForm.tsx      # Platform CRUD + S3/MinIO config + test button
      GameEditorForm.tsx    # Game metadata editor
      CoverUploader.tsx     # Cover upload (file / URL / SteamGridDB / RAWG)
    shared/
      DownloadButton.tsx
    game/
      ScreenshotCarousel.tsx
prisma/
  schema.prisma            # Full DB schema
Dockerfile                 # Multi-stage: deps → builder → runner (node:20-alpine)
docker-compose.yml         # gamehub service on gamehub-net; ROM drives mounted read-only
.env.production            # Runtime env (DATABASE_URL, SESSION_SECRET, ADMIN_PASSWORD, PUBLIC_IP, API keys)
```

---

## Database Schema (key models)

```
Platform      id, slug, name, scanPath (pipe-separated), extensions (comma-separated),
              scanMode (flat|folder|ports), sortOrder, enabled, thumbnailWidth, thumbnailHeight,
              scanDlc (bool)

Game          id, filePath (unique), fileName, fileSize (BigInt),
              platformId, title, sortTitle, region, releaseYear, genre,
              developer, publisher, coverPath (S3 key), coverUrl (external URL),
              trailerUrl, description, customNotes,
              rawgId, rawgSlug, igdbId,
              isFavorite, isHidden, playCount,
              lastSeenAt, metadataFetchedAt

GameDlc       id, gameId, filePath (unique), fileName, fileSize (BigInt),
              title?, type ("dlc"|"update"|"mod")

Setting       key (PK), value          ← all runtime config lives here
ScanLog       scan history
RequestLog    HTTP analytics
DownloadLog   per-download tracking
DownloadToken token, gameId, dlcId?, status (waiting|ready|downloading|done|expired)
Donation      donations tracking (Ko-fi webhook + manual)
IpCache       geo-IP cache
```

---

## Key Settings (DB `Setting` table keys)

| Key | Purpose |
|---|---|
| `s3_endpoint_interno` | MinIO internal URL (Docker-reachable, e.g. `http://192.168.1.x:9000`) |
| `s3_endpoint_publico` | MinIO public URL (legacy — no longer used for image display) |
| `s3_access_key` / `s3_secret_key` | MinIO credentials |
| `s3_bucket_name` | MinIO bucket (default `gamehub`) |
| `s3_region` | MinIO region (default `us-east-1`) |
| `rawg_api_key` | RAWG metadata API |
| `steamgriddb_key` | SteamGridDB cover art |
| `youtube_api_key` | YouTube trailer search |
| `app_url` | Public app URL (used for download links in shop) |
| `max_concurrent_downloads` | Queue concurrency |
| `shop_password` | CyberFoil/Tinfoil password |
| `donate_kofi` / `donate_paypal` / `donate_bmac` | Donation links |

All settings also have env-var fallbacks in `.env.production` (DB wins over env).

---

## Authentication

- Single admin password set via `ADMIN_PASSWORD` env var.
- `POST /api/auth/login` → issues a 30-day JWT cookie `gamehub_session`.
- `isAdminSession()` (Server Components / Route Handlers) reads the cookie.
- `getSessionFromRequest(req)` (middleware) reads the cookie from `NextRequest`.
- `PUBLIC_IP` env var: if set, requests from that IP also get admin access (for external access).
- LAN IPs (RFC-1918: 10.x, 172.16–31.x, 192.168.x) always bypass IP checks.
- Middleware protects `/admin/*` pages and mutating API routes. Non-mutating admin API routes (like `s3-test`) check `isAdminSession()` internally.

---

## Cover Art Flow

1. User uploads file or URL via `CoverUploader.tsx` → `POST /api/covers`
2. Server: `sharp` resizes to 1200×1800 webp → `uploadCoverToS3` writes to MinIO
   - Key: `covers/<platform-slug>/<gameId>.webp`
   - Original key: `covers/<platform-slug>/<gameId>.original.webp` (for crop re-adjustments)
   - `replaceOriginal=true` on new upload, `false` on crop-adjust
3. DB stores the S3 key (NOT a full URL)
4. `resolveCoverPath(key)` → `/api/covers/proxy/<key>` (Next.js proxy route)
5. `/api/covers/proxy/[...key]` fetches from MinIO internal endpoint and streams to browser
   - This avoids HTTPS/HTTP mixed-content issues when MinIO runs on plain HTTP

**Why proxy?** The site is HTTPS (Apache2). MinIO runs on HTTP internally. Browsers block HTTP images on HTTPS pages. Routing through Next.js makes everything same-origin HTTPS.

---

## Scanner

- Triggered via `POST /api/scanner` (admin only).
- Reads all enabled platforms from DB; for each: walks `scanPath` directories.
- Three scan modes:
  - `flat` — each file = one game. 3DS Title ID in filename → classify as game/update/dlc.
  - `folder` — each subfolder = one game. Subfolders named `update/updates`, `dlc/dlcs`, `mod/mods` → extras.
  - `ports` — PSVita ports layout (loose files + game folders, no deep walk).
- **Stub games**: folders with only DLC/updates but no base game file → created with `fileSize=0`, `fileName=''`, `filePath=folderPath`.
- **Stale marking**: games not seen in the current scan → `isHidden=true`. Skipped if any scan path was inaccessible (to avoid wiping DB when a drive is offline).
- Scanner streams live output via SSE (`/api/scanner/stream`).

---

## CyberFoil / Tinfoil Shop

- `GET /api/shop` — main shop JSON (authenticated with `shop_password` if set).
- `GET /api/shop/dlc` — DLC list.
- `GET /api/shop/updates` — updates list.
- `GET /api/shop/debug` — LAN-only diagnostic; shows every game/DLC with inclusion status and exclusion reasons.
- Only `.nsp`, `.nsz`, `.xci`, `.xcz` files are included.
- Files must have `fileSize > 0` AND exist on disk (`fs.existsSync`).
- Game titles should include `[TITLEID]` bracket syntax for CyberFoil to look them up in its database.

---

## Download Queue

- `DownloadButton` → `POST /api/queue` → returns a token.
- Client polls `GET /api/queue/<token>` (SSE or polling) until status = `ready`.
- `GET /api/download/<gameId>` streams the file with `Content-Disposition: attachment`.
- Concurrency controlled by `max_concurrent_downloads` setting.

---

## Deployment (Raspberry Pi)

```
Raspberry Pi
  ├── Docker
  │   └── gamehub container (port 3000, gamehub-net network)
  └── Apache2 (port 443 HTTPS, reverse proxy → localhost:3000)
      └── mod_headers: RequestHeader set X-Real-IP "expr=%{REMOTE_ADDR}"

MinIO runs separately (different Docker network or bare-metal).
→ s3_endpoint_interno must be the LAN IP, NOT the hostname "minio"
  (gamehub container and MinIO are on different Docker networks)
```

**Apache2 header fix:** The `X-Real-IP` header must use `expr=%{REMOTE_ADDR}` syntax (NOT `%{REMOTE_ADDR}s` — the `s` suffix is for SSL variables and returns empty string).

**Docker rebuild required** after every code change:
```bash
git pull && docker compose up -d --build
```

---

## Important Conventions

1. **Never hardcode IPs, domains, or URLs** in source code. All external addresses come from the DB `Setting` table or env vars.
2. **DB is the source of truth** for platform config. `src/lib/scanner/platforms.ts` is seed-only.
3. **BigInt**: `fileSize` is `BigInt` in Prisma. Use `BigInt(0)` not `0n` (project targets < ES2020 in some paths). Serialize with `toString()` before sending to client.
4. **i18n**: all UI strings go through `next-intl`. Translation files: `messages/en.json` and `messages/es.json`.
5. **sharp in Docker**: `sharp` is explicitly copied in the Dockerfile runner stage because Next.js standalone doesn't always trace native binaries correctly on ARM/Alpine.
6. **S3 key format**: `covers/<platform-slug>/<gameId>.webp` — never store full URLs in the DB `coverPath` field.
7. **Middleware matcher**: adding a new protected API route requires adding it to `PROTECTED_API_PATTERNS` (mutating) or checking `isAdminSession()` internally (read-only admin).

---

## Environment Variables (.env.production)

```env
DATABASE_URL="file:/data/gamehub.db"
SESSION_SECRET="<32+ char random string>"
ADMIN_PASSWORD="<your password>"
PUBLIC_IP="<your public IP for external admin access, optional>"
NEXT_PUBLIC_APP_URL="https://your-domain.com"
# Optional (can also be set in Admin → Settings):
RAWG_API_KEY=""
YOUTUBE_API_KEY=""
STEAMGRIDDB_API_KEY=""
```

---

## Useful Endpoints for Debugging

| URL | Notes |
|---|---|
| `http://<pi-ip>:3000/api/shop/debug` | LAN-only. Shows all games/DLC with inclusion/exclusion reasons |
| `/api/admin/s3-test` | Admin session required. Tests MinIO connectivity end-to-end |
| `/api/admin/traffic` | Analytics stats |
| `/api/scanner/stream` | SSE stream of live scanner output |
