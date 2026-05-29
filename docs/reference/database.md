# Database schema

SQLite via Prisma. Source of truth: [`prisma/schema.prisma`](../../prisma/schema.prisma).
Migrations live in `prisma/migrations/` and run on container start
(`prisma migrate deploy`).

## Models

### `Platform`
Per-console configuration (edited in Admin → Settings).

| Field | Notes |
|---|---|
| `slug` (unique), `name` | identity / display |
| `scanPath` | scan roots, multiple separated by `\|` |
| `extensions` | comma-separated (e.g. `.nsp,.nsz`) |
| `scanMode` | `flat` \| `folder` \| `ports` |
| `scanDlc` | Title-ID DLC linking (3DS/NDS) |
| `thumbnailWidth`, `thumbnailHeight` | cover aspect |
| `emulators` | JSON `{ windows?, android?, ios? }` of `{ name, url }` (per-OS download links) |
| `emulatorName`, `emulatorUrl` | **deprecated**, superseded by `emulators` |
| `sortOrder`, `enabled`, `iconPath` | |

### `Game`
| Field | Notes |
|---|---|
| `filePath` (unique), `fileName`, `fileSize` (BigInt) | on-disk file |
| `platformId` → `Platform` | |
| `title`, `sortTitle`, `region`, `releaseYear`, `genre`, `developer`, `publisher`, `description`, `customNotes` | metadata |
| `coverPath` | S3 key (served via the proxy), **not** a URL |
| `coverUrl`, `trailerUrl`, `screenshotPaths` | external media |
| `externalLinks` | JSON array `[{ title, description, url }]` (GitHub-aware on the UI) |
| `groupKey` | multi-disc unification key; indexed `(platformId, groupKey)` |
| `rawgId`, `rawgSlug`, `igdbId` | provider IDs |
| `sha256` | computed lazily after first full download |
| `isFavorite`, `isHidden`, `playCount`, `lastPlayedAt` | |
| `lastSeenAt`, `metadataFetchedAt` | scan / metadata bookkeeping |

### `GameDlc`
Updates / DLC / mods attached to a `Game`.

| Field | Notes |
|---|---|
| `gameId` → `Game` (cascade delete) | |
| `filePath` (unique), `fileName`, `fileSize`, `title` | |
| `type` | `dlc` \| `update` \| `mod` |

### `Setting`
`key` (PK) / `value` — runtime config that overrides env vars. See
[../configuration/environment.md](../configuration/environment.md).

### `DownloadToken`
The download queue (`waiting`/`ready`/`downloading`/`done`/`expired`). See
[../features/downloads-queue.md](../features/downloads-queue.md).

### Logging & analytics
| Model | Purpose |
|---|---|
| `RequestLog` | per-request log (ip, path, method, status, device, browser, bytes, durationMs, ts) |
| `SearchLog` | search queries (query, ip, results, ts) |
| `DownloadLog` | download events (game/dlc, ip, device, bytes, started/finished, completed) |
| `IpCache` | geo/ISP cache per IP (country, city, isp, flag) |
| `ScanLog` | scan runs (counts found/added/updated/stale, errors, platform breakdown) |
| `Donation` | manual + Ko-fi webhook donations |

These power `/admin/traffic` and the Prometheus exporter.

## Working with the DB

```bash
npm run db:studio     # Prisma Studio GUI
npm run db:migrate    # create/apply a dev migration
npm run db:export     # back up the local DB
npm run db:import     # import + remap paths (see deployment/database-migration.md)
```

Production migrations are applied automatically on deploy. To add a schema
change: edit `schema.prisma`, create a migration folder under
`prisma/migrations/<timestamp>_<name>/migration.sql`, and it runs on next start.
