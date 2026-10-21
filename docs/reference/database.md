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
| `rawgId`, `rawgSlug`, `launchboxId` | provider IDs |
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
| `DownloadLog` | download events (game/dlc, ip, device, fileSize, started/finished, completed) |
| `Job` | long-running work (scan, metadata batch) with status and progress |
| `IpCache` | geo/ISP cache per IP (country, city, isp, flag) |
| `ScanLog` | scan runs (counts found/added/updated/stale, errors, platform breakdown) |
| `Donation` | manual + Ko-fi webhook donations |

These power `/admin/traffic` and the Prometheus exporter.

## Catalog and image repository

Two groups of tables were added for the metadata repository. The text columns on
`Game` (`publisher`, `developer`, `genre`) keep the name the source published, for
display. The canonical rows below are what the data is grouped and counted by.

```mermaid
erDiagram
    Platform ||--o{ Game : "has"
    Game ||--o{ GameDlc : "has"
    Game ||--o{ GameImage : "has (LaunchBox originals)"
    Game ||--o{ GameGenre : "tagged with"
    Genre ||--o{ GameGenre : "tags"
    Company ||--o{ Game : "publishes (publisherCompanyId)"
    Company ||--o{ Game : "develops (developerCompanyId)"
    Game ||--o{ DownloadLog : "downloaded as"
    Game {
        int id PK
        string title
        string publisher "text, as published"
        int publisherCompanyId FK
        string developer "text, as published"
        int developerCompanyId FK
        string genre "text, as published"
        string artStatus "ok | no-art | no-match"
        string backdropPath
        string tilePath
        string logoPath
        string themePalette
        int launchboxId
    }
    Company {
        int id PK
        string key UK "publisherKey, shared with the home ranking"
        string name "most used spelling"
    }
    Genre {
        int id PK
        string key UK
        string name
    }
    GameGenre {
        int gameId PK, FK
        int genreId PK, FK
    }
    GameImage {
        int id PK
        int gameId FK
        string kind "banner, fanart, box-front, box-back, box-3d, box-spine, cart-front, disc, clear-logo, square, screenshot-gameplay, screenshot-game-title, other:<name>"
        string region
        int width
        int height
        string s3Key "repo/<platform>/<game>/<kind>-<hash>.webp"
        string sourceUrl UK(gameId, sourceUrl)
    }
```

- **`Company`** holds publishers and developers alike. Its `key` is computed by
  `publisherKey` (`src/lib/publishers.ts`), the same function the home ranking uses,
  so the two stay in step. `normalizeCatalog` (`POST /api/admin/catalog/normalize`,
  admin only) links every game; it is idempotent.
- **`Genre`** comes from the comma-separated text of `Game.genre`. A game's genres are
  rebuilt on each link.
- **`GameImage`** is one row per LaunchBox image. `kind` is the normalized category
  (`src/lib/game-images.ts`); unknown categories keep their LaunchBox name as
  `other:<name>`. `artStatus` on `Game` tells games with no art apart from games with
  no LaunchBox match: that is the list still to complete from other sources.
- Wikidata fills an empty developer, publisher, year or genre (`src/lib/metadata/wikidata.ts`)
  and links the game to its canonical rows. It never overwrites a value that is set.

## Working with the DB

> The `.db` files are **not** committed to the repo. Generate the database the
> first time with `npm run db:migrate` (creates `prisma/gamehub.db` from the
> migrations) + `npm run seed` for the default platforms. In Docker it's created
> automatically on container start.

```bash
npm run db:studio     # Prisma Studio GUI
npm run db:migrate    # create/apply a dev migration
npm run db:export     # back up the local DB
npm run db:import     # import + remap paths (see deployment/database-migration.md)
```

Production migrations are applied automatically on deploy. To add a schema
change: edit `schema.prisma`, create a migration folder under
`prisma/migrations/<timestamp>_<name>/migration.sql`, and it runs on next start.
