import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'
import { parseGameFilters, gameListWhere } from '@/lib/games/filters'

export const dynamic = 'force-dynamic'

// GET /api/admin/games/export
// Query params (all optional):
//   format    json | csv          (default: json)
//   platform  <platform slug>     filter to a single platform
//   search    <text>              filter by title (contains)
//   noScore   1                   only games without a score (mirrors the games list chip)
//   noCover   1                   only games with neither a stored cover nor a URL
//   noMeta    1                   only games whose metadata was never fetched
//   includeHidden  1              include graveyard (isHidden) games too
//
// Admin-only — protected by middleware (PROTECTED_API_PATTERNS).
// Exports the FULL filtered set (not paginated): title (from metadata),
// file path/size and the rest of the metadata, grouped/ordered by platform.

// Columns, in order. Keys map to the exported row shape below.
const FIELDS = [
  'id',
  'title',
  'sortTitle',
  'platform',
  'platformSlug',
  'region',
  'releaseYear',
  'genre',
  'developer',
  'publisher',
  'fileName',
  'filePath',
  'fileSizeBytes',
  'hasCover',
  'isFavorite',
  'createdAt',
] as const

type GameWithPlatform = Prisma.GameGetPayload<{
  include: { platform: { select: { name: true; slug: true } } }
}>

function toRow(g: GameWithPlatform): Record<(typeof FIELDS)[number], string | number | boolean> {
  return {
    id: g.id,
    title: g.title,
    sortTitle: g.sortTitle ?? '',
    platform: g.platform.name,
    platformSlug: g.platform.slug,
    region: g.region ?? '',
    releaseYear: g.releaseYear ?? '',
    genre: g.genre ?? '',
    developer: g.developer ?? '',
    publisher: g.publisher ?? '',
    fileName: g.fileName,
    filePath: g.filePath,
    fileSizeBytes: g.fileSize.toString(), // BigInt → string (JSON can't serialize BigInt)
    hasCover: Boolean(g.coverPath || g.coverUrl),
    isFavorite: g.isFavorite,
    createdAt: g.createdAt.toISOString(),
  }
}

function csvCell(value: string | number | boolean): string {
  let s = value === null || value === undefined ? '' : String(value)
  // Spreadsheets run a cell starting with = + - @ or a tab/CR as a formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  // Quote when the value contains a comma, quote, or newline; escape quotes by doubling.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: ReturnType<typeof toRow>[]): string {
  const header = FIELDS.join(',')
  const lines = rows.map((r) => FIELDS.map((f) => csvCell(r[f])).join(','))
  // ﻿ (BOM) so Excel reads UTF-8 accents/CJK in game titles correctly.
  return '﻿' + [header, ...lines].join('\r\n')
}

function fetchGames(where: Prisma.GameWhereInput) {
  return db.game.findMany({
    where,
    orderBy: [
      { platform: { sortOrder: 'asc' } },
      { sortTitle: 'asc' },
      { title: 'asc' },
    ],
    include: { platform: { select: { name: true, slug: true } } },
  })
}

export async function GET(req: NextRequest) {
  const denied = await adminGuard()
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const format = (searchParams.get('format') ?? 'json').toLowerCase() === 'csv' ? 'csv' : 'json'
  const filters = parseGameFilters(Object.fromEntries(searchParams))
  const includeHidden = searchParams.get('includeHidden') === '1'

  const where: Prisma.GameWhereInput = {
    ...gameListWhere(filters),
    ...(includeHidden && { isHidden: undefined }),
  }

  const games = await fetchGames(where)
  const rows = games.map(toRow)

  const stamp = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const scope = filters.platform || 'all'
  const filename = `gamehub-games-${scope}-${stamp}.${format}`

  const body = format === 'csv' ? toCsv(rows) : JSON.stringify(rows, null, 2)
  const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8'

  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
