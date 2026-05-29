# Switch shop API (Tinfoil / DBI / CyberFoil)

GameHub exposes your Switch library as a **Tinfoil-compatible HTTP shop index**,
so a homebrew client on the console can browse and install titles directly.

> **LAN-only by design.** Every shop route rejects non-private client IPs
> (`403`). Access it on the Raspberry's **LAN IP + host port** (`:3001`), not the
> public HTTPS domain. Optional Basic-Auth via the `shop_password` setting.

## Endpoints

| Method · Path | Returns |
|---|---|
| `GET /api/shop` | Index: base NSP/NSZ/XCI/XCZ files + `directories` (DLC/updates) + `titledb` metadata |
| `GET /api/shop/dlc` | Sub-index listing DLC files |
| `GET /api/shop/updates` | Sub-index listing update files |
| `GET /api/shop/download/[id]/[filename]` | Streams a base game (Range supported) |
| `GET /api/shop/download/dlc/[id]/[filename]` | Streams a DLC/update (Range supported) |

Only games whose file is a Switch extension (`.nsp`, `.nsz`, `.xci`, `.xcz`),
has a size > 0, and currently **exists on disk** are listed (so titles on an
offline drive don't appear).

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
    "0100ABC000XXX000": { "id": "...", "name": "...", "description": "...", "publisher": "...", "size": 1234567 }
  },
  "success": "GameHub · 42 titles"
}
```

`titledb` is keyed by the 16-hex Nintendo Title ID parsed from each filename
(`Game Name [0100ABC000XXX000].nsp`).

## Authentication

If the `shop_password` setting is set, all shop routes require HTTP **Basic
Auth**. The username is ignored; only the password is checked. Leave it empty for
open access on the LAN.

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
- If you must reach the shop from outside the LAN, front it with your own
  authenticated proxy/VPN; the app intentionally restricts it to private ranges.
