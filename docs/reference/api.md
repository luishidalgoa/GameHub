# API reference

Route handlers live under `src/app/api/`. Auth is enforced by
`src/middleware.ts` (admin session cookie + IP) for the protected routes below,
plus per-route checks (shop/metrics are IP/token gated independently).

## Auth & session

| Method · Path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/login` | password | Sets the `gamehub_session` JWT cookie (HS256, 30d) |
| `POST /api/auth/logout` | — | Clears the session |
| `GET /api/auth/me` | — | `{ admin: boolean }` (also the container healthcheck) |
| `GET /api/auth/is-admin-ip` | — | Whether the client IP may see admin UI |

Admin access requires a valid session **and** the request to come from a LAN IP
or the configured `PUBLIC_IP`.

## Library (public read)

| Method · Path | Purpose |
|---|---|
| `GET /api/games` | Paginated games: `platform, search, sort, region, favorites, page, pageSize` |
| `GET /api/games/[id]` | One game (+ platform + dlcs); cover path resolved |
| `GET /api/games/[id]/screenshots` | RAWG screenshots |
| `GET /api/platforms` | Enabled platforms (+ game counts) |
| `GET /api/search` | Quick search |

## Library (admin write — session required)

| Method · Path | Purpose |
|---|---|
| `PATCH /api/games/[id]` | Edit a game (metadata, cover, flags, external links) |
| `DELETE /api/games/[id]` | Delete a game |
| `POST /api/games/merge` | Merge `{ sourceId }` into `{ targetId }` |
| `POST /api/platforms` · `PATCH /api/platforms` · `DELETE /api/platforms` | Manage platforms |
| `PUT /api/settings` | Update settings (keys table) |
| `POST /api/covers` | Upload/replace a cover (file or URL) |
| `GET /api/covers/steamgriddb` · `GET /api/covers/google-images` | Cover search providers |
| `GET /api/covers/proxy/[...key]` | Same-origin cover image proxy (public) |
| `GET·POST /api/metadata/[id]` | Search / apply RAWG metadata (Autofill) |
| `POST /api/scanner` · `GET /api/scanner/stream` | Trigger scan / SSE progress |
| `GET /api/admin/metadata/batch` | Auto Metadata Fetch (SSE); `?covers=`, `?trailers=` |
| `GET /api/admin/traffic` · `GET /api/admin/traffic/live` | Dashboard data |
| `GET·DELETE /api/admin/graveyard` · `POST /api/admin/graveyard/recover` | Missing-games tools |
| `GET /api/admin/fs/browse?path=` | Server folder picker (NFC/NFD tolerant) |
| `GET /api/admin/donations` · `POST /api/webhooks/kofi` | Donations |
| `GET /api/youtube/search` | Trailer search (editor) |

## Downloads & queue

| Method · Path | Purpose |
|---|---|
| `POST /api/queue` / `POST /api/queue/bulk` | Enqueue a download / all extras |
| `GET /api/queue/[token]` | Poll token status / position |
| `GET /api/download/[gameId]?token=` | Stream base game (Range/resume) |
| `GET /api/download/dlc/[dlcId]?token=` | Stream a DLC/update |

See [../features/downloads-queue.md](../features/downloads-queue.md).

## Switch shop (LAN-only)

| Method · Path | Purpose |
|---|---|
| `GET /api/shop` | Tinfoil index (files + directories + titledb) |
| `GET /api/shop/dlc` · `GET /api/shop/updates` | Sub-indexes |
| `GET /api/shop/download/[id]/[filename]` | Stream base game |
| `GET /api/shop/download/dlc/[id]/[filename]` | Stream DLC/update |

See [../features/switch-shop.md](../features/switch-shop.md).

## Observability

| Method · Path | Auth | Purpose |
|---|---|---|
| `GET /api/metrics` | LAN or `METRICS_TOKEN` bearer | Prometheus exporter |
| `POST /api/track/visit` | — | Client visit beacon (analytics) |

See [../observability/metrics-grafana.md](../observability/metrics-grafana.md).
