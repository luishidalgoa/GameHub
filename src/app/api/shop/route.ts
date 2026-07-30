/**
 * GET /api/shop
 *
 * CyberFoil / Tinfoil-compatible HTTP shop index.
 * LAN-only. Optional Basic Auth via the `shop_password` DB setting — see
 * `lib/shop-auth.ts` for both gates.
 *
 * Response shape:
 *   files      – downloadable NSP/NSZ/XCI files
 *   directories– sub-indexes (DLC, updates)
 *   titledb    – optional rich metadata keyed by Nintendo Title ID
 *   success    – message shown in the app UI
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'
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
      dlcs:        { select: { fileName: true, type: true } },
    },
  })

  const base = shopBaseUrl(req)
  const candidates = games.filter((g) => isSwitchFile(g.fileName))

  // Size comes from the file on disk, never from the DB: a ROM replaced without
  // a rescan would otherwise be advertised (and streamed) with a stale length,
  // which the console sees as a corrupt install. A null size means unreadable /
  // missing — e.g. an offline network share — so the title is simply not listed.
  const sizes = await statSize(candidates.map((g) => g.filePath))
  const available = candidates
    .map((g, i) => ({ game: g, size: sizes[i] }))
    .filter((c): c is { game: (typeof candidates)[number]; size: number } =>
      c.size !== null && c.size > 0)

  // ── files ─────────────────────────────────────────────────────────────────
  const files = available.map((c) => ({
    url:  `${base}/api/shop/download/${c.game.id}/${encodeURIComponent(c.game.fileName)}`,
    size: c.size,
  }))

  // ── titledb (rich metadata for CyberFoil eShop display) ───────────────────
  const titledb: Record<string, object> = {}
  for (const c of available) {
    const titleId = extractSwitchTitleId(c.game.fileName)
    if (!titleId) continue
    // Two files can carry the same Title ID (same game, different dump). Keep the
    // first instead of letting the last one silently win.
    if (titledb[titleId]) continue

    titledb[titleId] = {
      id:          titleId,
      name:        c.game.title,
      description: c.game.description ?? '',
      // Only the release year is known; Tinfoil wants an int date, so this is
      // January 1st of that year — a placeholder day, not a real release date.
      releaseDate: c.game.releaseYear ? c.game.releaseYear * 10000 + 101 : undefined,
      category:    c.game.genre ? [c.game.genre] : undefined,
      publisher:   c.game.publisher ?? undefined,
      size:        c.size,
    }
  }

  // ── directories: separate DLC and update sub-indexes ─────────────────────
  // Announced from DB rows only (no per-file stat — that is the sub-index's job).
  // Restricted to visible games so a hidden library doesn't advertise a folder
  // that then lists nothing.
  const extras     = games.flatMap((g) => g.dlcs)
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
