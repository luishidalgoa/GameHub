# Switch shop API (Tinfoil / DBI / CyberFoil)

GameHub exposes your Switch library as a **Tinfoil-compatible HTTP shop index**,
so a homebrew client on the console can browse and install titles directly.

> **LAN-only by design.** Every shop route rejects a client IP that is neither
> private nor listed in `TRUSTED_NETWORKS` (`403`). Access it on the Raspberry's
> **LAN IP + host port** (`:3001`), not the public HTTPS domain.
>
> **Set `shop_password`.** When the shop is reached directly on `:3001` there is no
> proxy header, so the client IP cannot be established at all (see
> [environment.md](../configuration/environment.md#why-the-client-ip-can-be-unknown))
> and the "LAN only" check has nothing to check. In that situation the only thing
> keeping your library private is that the port isn't reachable from outside —
> which stops being true the moment anything forwards or tunnels it. The password
> covers all six routes, index and sub-indexes included.

## Endpoints

| Method · Path | Returns |
|---|---|
| `GET /api/shop` | Index: base games **and regional editions** + `directories` (DLC/updates) + `titledb` metadata |
| `GET /api/shop/dlc` | Sub-index listing DLC files |
| `GET /api/shop/updates` | Sub-index listing update files |
| `GET /api/shop/download/[id]/[filename]` | Streams a base game (Range supported) |
| `GET /api/shop/download/dlc/[id]/[filename]` | Streams a DLC / update / regional edition (Range supported) |
| `GET /api/shop/debug` | Per-file inclusion status and the reason for every exclusion |

A file is listed when its extension is a Switch container (`.nsp`, `.nsz`,
`.xci`, `.xcz`), its game isn't hidden, and it is **readable on disk right now**
with a non-zero size (so titles on an offline drive don't appear).

Alternate regional editions (`GameDlc.type = 'region'`) are published in the main
index next to base games — they *are* base games, just from another region — and
their `titledb` name carries the region, e.g. `Chrono Trigger (Japan)`.

**Sizes always come from `fstat`, never from the DB.** The console trusts
`Content-Length`; advertising a stale length after a ROM was replaced without a
rescan produces a corrupt or hanging install. `/api/shop/debug` flags rows where
the DB and the disk disagree.

### `GET /api/shop` response shape

```jsonc
{
  "files": [
    { "url": "http://<host>/api/shop/download/12/Game%20[0100ABC...].nsp", "size": 1234567 }
  ],
  "directories": [
    "http://<host>/api/shop/dlc",
    "http://<host>/api/shop/updates"
  ],
  "titledb": {
    "0100ABC000XXX000": {
      "id": "0100ABC000XXX000", "name": "...", "description": "...",
      "publisher": "...", "size": 1234567,
      "iconUrl": "http://<host>/api/covers/proxy/covers/switch/12.webp",
      "bannerUrl": "http://<host>/api/covers/proxy/covers/switch/12.webp"
    }
  },
  "success": "GameHub · 42 titles"
}
```

`titledb` is keyed by the 16-hex Nintendo Title ID parsed from the filename
(`Game Name [0100ABC000XXX000].nsp`, or a bare `01…`/`05…` token). Cover art is
included when the game has one, so the console shows artwork instead of a plain
list. If two files carry the same Title ID the first one wins rather than the
last silently overwriting it. `releaseDate` is `<year>0101` — only the year is
known, the day is a placeholder.

The scheme in every URL follows `X-Forwarded-Proto` when `TRUST_PROXY` is on, so
the index keeps working if you ever front the shop with TLS.

## Authentication

If the `shop_password` setting is set, **all six** shop routes require HTTP
**Basic Auth** — index, sub-indexes, downloads and `/debug` alike. The username is
ignored; only the password is checked, with a constant-time comparison. The value
is cached in memory for 15 s so a multi-GB Range install doesn't re-query SQLite
for every chunk; saving it in Admin → Settings invalidates the cache immediately.

## How to connect

Find the Raspberry's LAN IP (e.g. `192.168.1.50`) and use the **host port**
(`3001` by default from `docker-compose`, unless you reach it through a proxy).

### Tinfoil

1. **File Browser** → press **`-`** (minus) → **Add Source**.
2. Configure:
   - **Protocol**: `http`
   - **Host**: `<raspberry-lan-ip>`
   - **Port**: `3001`
   - **Path**: `/api/shop`
   - **Username/Password**: only if you set `shop_password` (username = anything).
3. Save and open the source.

### DBI

Use **Network install** and point it at `http://<raspberry-lan-ip>:3001/api/shop`.

### CyberFoil

eShop → Add store → Protocol `http`, Host `<raspberry-lan-ip>`, Port `3001`,
Path `/api/shop`.

> The Admin → Settings "shop" panel shows the live URL (`http://<host>/api/shop`)
> detected from the browser, and the same connection steps.

## Notes

- Downloads use the same buffered + Range-capable streaming as the web
  downloads (pause/resume works). See [downloads-queue.md](downloads-queue.md).
- The shop does **not** use the web download token queue — it streams directly
  (clients like Tinfoil manage their own concurrency).
- A last-byte position past the end of the file is **clamped** (RFC 7233), not
  rejected with a 416, so clients that guess a large upper bound still work.
- Shop installs are recorded in the download log, so Admin → Traffic counts them.
  One row per install attempt (the request starting at byte 0), not one per Range
  chunk — a chunking client would otherwise create hundreds of rows per game, and
  `completed` means "the first range finished", which is a floor for those clients.
- If you must reach the shop from outside the LAN, front it with your own
  authenticated proxy/VPN; the app intentionally restricts it to private ranges.
