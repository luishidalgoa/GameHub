# Moving the database between machines

The SQLite DB stores absolute ROM paths in `Platform.scanPath`, `Game.filePath`
and `GameDlc.filePath`. When you move the DB between systems (e.g. the Linux Pi
and a Windows dev machine), those paths must be remapped — different drive roots
and `/` vs `\`.

## Local (any OS) — two npm scripts

```bash
npm run db:export    # → gamehub_backup_<timestamp>.db in the current folder
npm run db:import    # import a .db + remap paths interactively
```

- **`db:export`** (`scripts/db-export.ts`) copies `prisma/gamehub.db` to a
  timestamped backup in the current directory.
- **`db:import`** (`scripts/db-import.ts`):
  1. pick a `.db` file (or pass one: `npm run db:import -- backup.db`),
  2. back up the current `prisma/gamehub.db` to `.bak`,
  3. copy the chosen file into place,
  4. run `prisma migrate deploy`,
  5. **remap paths**: detect the disk roots, ask the target OS and the new root
     for each disk, then rewrite all scan/file paths (converting `/` ⇄ `\`).

### How root detection works

- **Windows** source → root = drive letter (`F:`, `E:`).
- **Linux** source → root = common prefix + one segment (`/mnt/F`,
  `/mnt/nextcloud_hdd_1`).

Everything *after* the root is preserved verbatim, so a disk that lives at
`E:\Preservación videojuegos\…` on Windows keeps that subfolder when mapped to
`/mnt/nextcloud_hdd_1` on Linux.

Example (Pi → Windows): map `/mnt/F` → `F:\` and `/mnt/nextcloud_hdd_1` → `E:\`.

## On the Raspberry Pi

The npm scripts target `prisma/gamehub.db`; on the Pi the **live DB is the Docker
volume** at `$APP_DIR/data/gamehub.db`. So manage it directly with `cp`:

```bash
# Back up the live DB
cp "$APP_DIR/data/gamehub.db" ~/gamehub_backup_$(date +%F).db

# Restore / swap in a .db (stop first to avoid corrupting SQLite in flight)
cd "$APP_DIR"
docker compose stop gamehub
cp /path/to/new.db data/gamehub.db
sudo chown -R 1001:1001 data && sudo chmod -R 775 data   # Prisma needs UID 1001
docker compose start gamehub
```

The Pi's paths are already Linux, so no remap is needed there. The **remap only
matters when crossing OSes** (Pi ⇄ Windows) — do that with `npm run db:import`
on the non-Pi machine.

## Typical Pi → local workflow

```bash
# on the Pi
cp "$APP_DIR/data/gamehub.db" ~/gamehub_backup.db
# copy that file to your PC (scp / Samba / etc.), into the GameHub folder

# on your PC
npm run db:import -- gamehub_backup.db   # target OS = windows, map roots (e.g. /mnt/F → F:\)
npm run dev
```

> Reminder: `prisma/gamehub.db`, `.env*` and `docker-compose.yml` are **not** in
> git. The code is recoverable from the repo; those local files are not.
