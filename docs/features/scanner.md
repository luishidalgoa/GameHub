# Scanner

The scanner discovers ROM files on disk and upserts `Game` / `GameDlc` rows. It
reads scan paths from the `Platform` table (Admin → Settings), **not** from
hardcoded config.

- Engine: `src/lib/scanner/index.ts` (`runScan`)
- Walkers: `src/lib/scanner/walker.ts`
- Title-ID helpers: `src/lib/scanner/titleid.ts`
- Trigger: `POST /api/scanner`; live progress via SSE `GET /api/scanner/stream`
- CLI: `npm run scan`

A platform's `scanPath` may list **multiple paths** separated by `|`. Stale
marking (hiding games no longer on disk) is skipped for a platform if any of its
paths is unreachable, to avoid hiding games from an offline drive.

## Scan modes (`Platform.scanMode`)

| Mode | Meaning | Used by |
|---|---|---|
| `flat` | Each file = one game (recursive walk) | PSP, generic |
| `folder` | Each folder = one game; `update`/`dlc`/`mod` subfolders attach as extras | Switch |
| `ports` | Root-level files **and** folders each = one game (no deep walk) | PS Vita ports |

### `flat` + DLC (3DS / NDS) — `Platform.scanDlc = true`

Title-ID-aware: filenames carrying a 3DS Title ID are classified as base
(`00040000…`), update (`0004000E…`) or DLC (`0004008C…`). Updates/DLC are linked
to the base game by the shared 8-char title key.

## Multi-disc / multi-directory unification

A single game can be split across drives (e.g. base game on one disk, update +
DLC on another). For `folder` and `ports` modes the scanner gathers folders
**across all scan paths first**, then groups them by a stable key:

- **Switch** → the base **Application ID** derived from the files' Title IDs
  (`tid:<baseAppId>`). Base / update / DLC of the same title share this ID.
- **Fallback** → normalized folder name (`name:<normalized>`).

Each group becomes **one** canonical `Game` (with the real base file) plus its
extras as `GameDlc`. Pre-existing duplicate rows are absorbed on the next scan.
The base file fields are only rewritten when a real base is found in the scan, so
a temporarily-offline disk won't blank an existing game.

Stored on `Game.groupKey` (indexed by `(platformId, groupKey)`).

### Manual merge

When auto-detection can't group two cards (different names, no Title IDs), merge
them by hand in the game editor → **"Fusionar duplicado"**, which calls
`POST /api/games/merge { targetId, sourceId }`: the source's files move onto the
target (base promoted or kept as an extra), the source's `groupKey` is adopted,
and the source row is deleted.

## SSE events

`GET /api/scanner/stream` emits: `connected`, `scan_start`, `platform_start`,
`file_found`, `platform_done`, `scan_complete`, then (if new games were added)
the auto-metadata pipeline events `auto_meta_start`, `auto_meta_progress`,
`auto_meta_done`, and finally `pipeline_done`. The admin Scan panel renders these
as a live log + progress bar.
