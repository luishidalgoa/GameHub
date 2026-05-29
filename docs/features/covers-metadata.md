# Covers & metadata

## Providers

| Provider | Used for | Key |
|---|---|---|
| **SteamGridDB** | Cover art (**preferred**) | `steamgriddb_key` / `STEAMGRIDDB_API_KEY` |
| **RAWG** | Title, description, year, genre, developer, publisher, screenshots; cover **fallback** | `rawg_api_key` / `RAWG_API_KEY` |
| **YouTube** | Trailer search | `youtube_api_key` (or `google_search_api_key`) |

> Bing image search exists as a legacy endpoint (`/api/covers/google-images`,
> needs `bing_image_key`) but is **not** wired into the UI.

### Cover source priority

All metadata flows prefer the best-matching **SteamGridDB** cover and fall back
to the RAWG image only if SGDB has none. `src/lib/metadata/steamgriddb.ts`:
first tries portrait box-art (600×900 / 342×482); if none, falls back to **any**
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

Confidence scoring (`src/lib/metadata/batch.ts`): Jaccard title similarity (0–50)
+ exact-title bonus (+20) + platform match (+30). `≥ 68` auto-applies; `40–67`
is skipped as "uncertain"; `< 40` discarded.

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
