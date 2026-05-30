# Covers & metadata

## Providers

| Provider | Used for | Key |
|---|---|---|
| **LaunchBox Games DB** | Covers (box-art front), screenshots, info (dev/publisher/genre/year/ESRB) | none (public, scraped) |
| **SteamGridDB** | Cover art | `steamgriddb_key` / `STEAMGRIDDB_API_KEY` |
| **RAWG** | Title, description, year, genre, developer, publisher, screenshots; cover fallback | `rawg_api_key` / `RAWG_API_KEY` |
| **YouTube** | Trailer search | `youtube_api_key` (or `google_search_api_key`) |

> Bing image search exists as a legacy endpoint (`/api/covers/google-images`,
> needs `bing_image_key`) but is **not** wired into the UI.

### Per-field provider matrix

Each kind of data picks its own source (Admin → Settings → **Metadata
providers**; settings `provider_cover|info|description|screenshots`). Defaults:
cover = LaunchBox, info = LaunchBox, description = RAWG (richer), screenshots =
LaunchBox. If the chosen source has nothing for a game, GameHub falls back to the
others (cover order: **LaunchBox box-art → SteamGridDB → RAWG**). Logic lives in
`src/lib/metadata/{matrix,compose}.ts`; `compose.ts` `gatherMetadata()` resolves
each field and returns provenance per field.

### LaunchBox (no API key, no browser — works headless on the Pi)

Everything is server-rendered HTML over plain HTTP, so the Raspberry Pi needs no
GUI and no client browser:

- **Search**: `GET {SITE}/games/results/?platform=<name>&title=<title>` → parse
  the `/games/details/<id>-<slug>` result cards (`<h3>` title, `<p>` platform).
- **Detail**: `GET {SITE}/games/details/<id>-<slug>` → title (`<h1>`),
  developer/publisher/genre (labelled links), ESRB/release-date/platform (text),
  and images typed by their `<img alt>` ("… - Box - Front …", "… - Screenshot
  …"). Cover = Box - Front; screenshots = Screenshot.
- LaunchBox throttles request bursts, so `lbFetch` retries with exponential
  backoff and the composer paces search→detail (`paceMs`).
- Slug→platform-name map is seeded in `launchbox.ts` and cached in the DB;
  refresh with `npm run launchbox:platforms`.

### Cover source priority

When the cover source is SteamGridDB (or as a fallback), `steamgriddb.ts` first
tries portrait box-art (600×900 / 342×482); if none, falls back to **any**
dimension (helps GBA and other non-portrait art).

This applies to: **Run Scan** auto-metadata, **Auto Metadata Fetch**, and the
manual **Autofill** button in the game editor.

## Metadata flows

- **Auto (after scan)** — `src/lib/metadata/auto.ts` → `runMetadataBatch` with
  covers + trailers, only for newly-added games.
- **Auto Metadata Fetch (admin)** — `GET /api/admin/metadata/batch` (SSE).
  Processes games without metadata **and** backfills trailers for games that
  already have metadata but no trailer (trailer-only, metadata untouched).
- **Manual Autofill** — `POST /api/metadata/[id]` from the game editor.

Confidence scoring (`src/lib/metadata/scoring.ts`): Jaccard title similarity
(0–50) + exact-title bonus (+20) + platform match (+30). `≥ 68` auto-applies;
`40–67` is skipped as "uncertain"; `< 40` discarded.

### YouTube error handling

`searchYouTubeTrailer` throws `YouTubeApiError` on a real API failure (quota /
bad key / network) vs returning `null` for "no match". The batch detects the
error and **stops searching trailers for the rest of the run** instead of failing
each game. Trailers are embedded with `referrerPolicy="strict-origin-when-cross-origin"`
to avoid YouTube "Error 153" behind the `no-referrer` Apache header.

## Cover storage & serving

- Covers are processed with `sharp` and stored in MinIO/S3 as
  `covers/<platform-slug>/<gameId>.webp` (plus a `.original.webp` source for the
  crop tool).
- `Game.coverPath` stores the **S3 key** (e.g. `covers/switch/123.webp?v=…`),
  not a full URL.
- It is served same-origin through the proxy: `resolveCoverPath()`
  (`src/lib/cover-url.ts`) turns the key into `/api/covers/proxy/<key>`, handled
  by `src/app/api/covers/proxy/[...key]/route.ts`. This avoids mixed-content when
  MinIO is plain HTTP.
- A `?v=<timestamp>` cache-buster is appended when a cover changes so browsers
  fetch the new image despite long cache lifetimes.

## Crop / adjust tool

`CoverAdjustModal` (`src/components/admin/CoverAdjustModal.tsx`) operates on the
**original** image. The crop frame is locked to the platform's
`thumbnailWidth:thumbnailHeight` aspect and **defaults to showing the whole cover
("contain")** — nothing is cropped unless you drag/resize the frame. Output is
high-resolution (`min(1200, thumbnailWidth*6)` wide).
