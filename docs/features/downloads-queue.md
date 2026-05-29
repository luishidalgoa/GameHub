# Downloads & queue

ROM downloads go through a **DB-backed token queue** so a small server isn't
overwhelmed by simultaneous transfers.

- Queue logic: `src/lib/download-queue.ts` (table `DownloadToken`)
- Enqueue: `POST /api/queue` (single) / `POST /api/queue/bulk` (all extras)
- Status/poll: `GET /api/queue/[token]`
- File stream: `GET /api/download/[gameId]?token=…` and
  `GET /api/download/dlc/[dlcId]?token=…`
- Concurrency limit: the `max_concurrent_downloads` setting (recommended 1–3 on a Pi)

## Token lifecycle

```
waiting ──(slot frees)──> ready ──(download starts)──> downloading ──(ends)──> done
   │                         └─(15 min unused)────────> expired
```

- `enqueue()` creates a `waiting` token and promotes it to `ready` if a slot is
  free (`active downloading < max_concurrent_downloads`).
- A full-file `GET` requires a `ready` token (returns `425 Too Early` with the
  queue position otherwise), marks it `downloading`, and frees the slot +
  promotes the next on completion/cancel.
- `done`/`expired` tokens are pruned after 30 minutes.

## Streaming & resume

- File responses use a **4 MiB read buffer** with proper backpressure
  (`Readable.toWeb`, `src/lib/stream.ts`) — this is the fix for the previous
  ~2 MB/s ceiling and mid-download stalls caused by the default 64 KiB chunking.
- **HTTP Range requests** are supported (`206 Partial Content`) so download
  managers and the Switch shop can pause/resume. A range request only needs a
  token matching the game (it doesn't consume a queue slot), which covers
  resume after an interruption.
- `Accept-Ranges: bytes`, `Content-Disposition: attachment`, and (when known) an
  `ETag`/`X-Checksum-SHA256` are sent. SHA-256 is computed lazily and cached on
  the `Game` row after the first successful full download.

## Logging

Each download writes a `DownloadLog` row (game/DLC, IP, device, browser,
bytes, started/finished, completed). This feeds the `/admin/traffic` dashboard
and the Prometheus `gamehub_downloads_*` metrics.
