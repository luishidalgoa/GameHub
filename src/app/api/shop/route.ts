/**
 * GET /api/shop
 *
 * CyberFoil / Tinfoil-compatible HTTP shop index.
 * LAN-only. Optional Basic Auth via the `shop_password` DB setting — see
 * `lib/shop-auth.ts` for both gates.
 *
 * Response shape:
 *   files      – downloadable NSP/NSZ/XCI files (base games + regional editions)
 *   directories– sub-indexes (DLC, updates)
 *   titledb    – optional rich metadata keyed by Nintendo Title ID
 *   success    – message shown in the app UI
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'
import { resolveCoverPath } from '@/lib/cover-url'

/**
 * screenshotPaths is a JSON-encoded string array. A malformed value costs a
 * carousel, never the whole shop index, so parse failures fall back to none.
 */
function parseScreenshots(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}
import { isSwitchFile, statSize } from '@/lib/shop-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const games = await db.game.findMany({
    where: { isHidden: false },
    select: {
      id:          true,
      filePath:    true,
      fileName:    true,
      title:       true,
      description: true,
      releaseYear: true,
      genre:       true,
      publisher:   true,
      coverPath:   true,
      coverUrl:    true,
      // Campos que solo consume GameHubNX (claves gh_ del titledb).
      developer:       true,
      languages:       true,
      trailerUrl:      true,
      groupKey:        true,
      screenshotPaths: true,
      dlcs: {
        select: { id: true, filePath: true, fileName: true, type: true, region: true },
      },
    },
  })

  const base = shopBaseUrl(req)

  // Candidates: the base game file plus every alternate regional edition (stored
  // as GameDlc rows with type 'region' since 2.6.0 — they are full base games in
  // another region, so they belong in the main index, not in a sub-directory).
  type Candidate = {
    url:      string
    filePath: string
    fileName: string
    game:     (typeof games)[number]
    region:   string | null
  }

  const candidates: Candidate[] = []
  for (const g of games) {
    if (isSwitchFile(g.fileName)) {
      candidates.push({
        url:      `${base}/api/shop/download/${g.id}/${encodeURIComponent(g.fileName)}`,
        filePath: g.filePath,
        fileName: g.fileName,
        game:     g,
        region:   null,
      })
    }
    for (const d of g.dlcs) {
      if (d.type !== 'region' || !isSwitchFile(d.fileName)) continue
      candidates.push({
        url:      `${base}/api/shop/download/dlc/${d.id}/${encodeURIComponent(d.fileName)}`,
        filePath: d.filePath,
        fileName: d.fileName,
        game:     g,
        region:   d.region,
      })
    }
  }

  // Size comes from the file on disk, never from the DB: a ROM replaced without
  // a rescan would otherwise be advertised (and streamed) with a stale length,
  // which the console sees as a corrupt install. A null size means unreadable /
  // missing — e.g. an offline network share — so the title is simply not listed.
  const sizes = await statSize(candidates.map((c) => c.filePath))
  const available = candidates
    .map((c, i) => ({ ...c, size: sizes[i] }))
    .filter((c): c is Candidate & { size: number } => c.size !== null && c.size > 0)

  const files = available.map((c) => ({ url: c.url, size: c.size }))

  // ── titledb (rich metadata for CyberFoil / Tinfoil eShop display) ─────────
  const titledb: Record<string, object> = {}
  for (const c of available) {
    const titleId = extractSwitchTitleId(c.fileName)
    if (!titleId) continue
    // Two files can carry the same Title ID (same game, different dump). Keep the
    // first instead of letting the last one silently win.
    if (titledb[titleId]) continue

    const cover = resolveCoverPath(c.game.coverPath) ?? c.game.coverUrl ?? null
    const coverUrl = cover?.startsWith('/') ? `${base}${cover}` : cover

    const shots = parseScreenshots(c.game.screenshotPaths)
      .map((p) => (p.startsWith('/') ? `${base}${p}` : p))

    titledb[titleId] = {
      id:          titleId,
      name:        c.region ? `${c.game.title} (${c.region})` : c.game.title,
      description: c.game.description ?? '',
      // Only the release year is known; Tinfoil wants an int date, so this is
      // January 1st of that year — a placeholder day, not a real release date.
      releaseDate: c.game.releaseYear ? c.game.releaseYear * 10000 + 101 : undefined,
      category:    c.game.genre ? [c.game.genre] : undefined,
      publisher:   c.game.publisher ?? undefined,
      size:        c.size,
      ...(coverUrl ? { iconUrl: coverUrl, bannerUrl: coverUrl } : {}),
      
      // ── Extension propia para GameHubNX ─────────────────────────────────
      // Tinfoil y CyberFoil ignoran las claves que no conocen, asi que esto
      // enriquece nuestra app sin romperles nada. El prefijo gh_ deja claro
      // que no forma parte del formato y evita chocar con claves que Tinfoil
      // pueda anadir mas adelante.
      //
      // `name` lleva la region pegada al titulo porque Tinfoil solo tiene ese
      // campo; gh_title y gh_region van sueltos para que la ficha los maquete
      // como quiera.
      gh_title:      c.game.title,
      ...(c.region           ? { gh_region:      c.region }           : {}),
      ...(c.game.languages   ? { gh_languages:   c.game.languages }   : {}),
      ...(c.game.developer   ? { gh_developer:   c.game.developer }   : {}),
      ...(c.game.releaseYear ? { gh_year:        c.game.releaseYear } : {}),
      ...(c.game.trailerUrl  ? { gh_trailer:     c.game.trailerUrl }  : {}),
      ...(c.game.groupKey    ? { gh_group:       c.game.groupKey }    : {}),
      ...(shots.length > 0   ? { gh_screenshots: shots }              : {}),
    }
  }

  // ── directories: separate DLC and update sub-indexes ─────────────────────
  // Announced from DB rows only (no per-file stat — that is the sub-index's job).
  // Restricted to visible games so a hidden library doesn't advertise a folder
  // that then lists nothing.
  const extras   = games.flatMap((g) => g.dlcs)
  const hasDlc     = extras.some((d) => d.type === 'dlc'    && isSwitchFile(d.fileName))
  const hasUpdates = extras.some((d) => d.type === 'update' && isSwitchFile(d.fileName))

  const directories: string[] = []
  if (hasDlc)     directories.push(`${base}/api/shop/dlc`)
  if (hasUpdates) directories.push(`${base}/api/shop/updates`)

  return NextResponse.json({
    files,
    directories,
    ...(Object.keys(titledb).length > 0 && { titledb }),
    success: `GameHub · ${files.length} titles`,
  })
}
