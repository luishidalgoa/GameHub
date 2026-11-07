import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deletePlatformDeep, renamePlatformSlug } from '@/lib/platforms/maintenance'
import { adminGuard } from '@/lib/admin-guard'
import { isAdminSession } from '@/lib/auth'
import { parseSourceConfigs, sourceConfigError, type SourceConfig } from '@/lib/external/source-types'
import { refreshTorrentGames } from '@/lib/external/torrents'

export const dynamic = 'force-dynamic'

export async function GET() {
  const platforms = await db.platform.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { games: { where: { isHidden: false, variantOfId: null } } } } },
  })
  // scanPath is a path on the server's disk: only the admin sees it.
  if (await isAdminSession()) return NextResponse.json(platforms)
  return NextResponse.json(platforms.map(({ scanPath: _scanPath, ...p }) => p))
}

export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = await req.json()
  const { slug, name, scanPath, extensions, scanMode, thumbnailWidth, thumbnailHeight, sortOrder, scanDlc } = body
  if (!slug || !name || !scanPath || !extensions) {
    return NextResponse.json({ error: 'slug, name, scanPath and extensions are required' }, { status: 400 })
  }
  const platform = await db.platform.create({
    data: {
      slug:            slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name,
      scanPath,
      extensions,
      scanMode:        scanMode ?? 'flat',
      thumbnailWidth:  thumbnailWidth ?? 200,
      thumbnailHeight: thumbnailHeight ?? 300,
      sortOrder:       sortOrder ?? 99,
      scanDlc:         scanDlc ?? false,
    },
  })
  return NextResponse.json(platform, { status: 201 })
}

// The fields an admin may change on a platform. Anything else in the body is
// dropped: the id and the slug are handled separately below (#87).
const PLATFORM_EDITABLE = [
  'name', 'scanPath', 'extensions', 'scanMode', 'thumbnailWidth', 'thumbnailHeight', 'altThumbnailWidth', 'altThumbnailHeight',
  'sortOrder', 'scanDlc', 'enabled', 'iconPath', 'emulators', 'onlineProviders', 'torrentSources', 'emulatorName', 'emulatorUrl',
] as const

/** Valida las fuentes de torrents de una plataforma y devuelve su forma normalizada para guardar. */
async function checkTorrentSources(platformId: number, input: unknown): Promise<{ value: string | null; keys: string[]; active: string[] } | { error: string }> {
  // The settings form sends the list as JSON text; accept that and the plain array.
  let raw: unknown = input
  if (typeof input === 'string') {
    try { raw = JSON.parse(input) } catch { return { error: 'las fuentes de torrents tienen que ser una lista' } }
  }
  if (raw === null) return { value: null, keys: [], active: [] }
  if (!Array.isArray(raw)) return { error: 'las fuentes de torrents tienen que ser una lista' }
  const list: SourceConfig[] = []
  for (const c of raw as Partial<SourceConfig>[]) {
    if (typeof c !== 'object' || c === null) return { error: 'cada fuente tiene que ser un objeto' }
    const err = sourceConfigError(c)
    if (err) return { error: `fuente «${c.key ?? '?'}»: ${err}` }
    // onlyTag/exceptTag reparten una fuente entre plataformas: si se pierden al guardar, la
    // plataforma trae todo el catalogo (Switch 2 recibio 7000 juegos de Switch 1).
    list.push({
      key: c.key!, type: c.type!, url: c.url!, enabled: c.enabled!,
      ...(c.onlyTag !== undefined && { onlyTag: c.onlyTag }),
      ...(c.exceptTag !== undefined && { exceptTag: c.exceptTag }),
    })
  }
  const keys = list.map(c => c.key)
  if (new Set(keys).size !== keys.length) return { error: 'hay claves de fuente repetidas' }
  const others = await db.platform.findMany({ where: { id: { not: platformId }, torrentSources: { not: null } }, select: { torrentSources: true } })
  const taken = new Set(others.flatMap(p => parseSourceConfigs(p.torrentSources).map(s => s.key)))
  const clash = keys.find(k => taken.has(k))
  if (clash) return { error: `la clave «${clash}» ya la usa otra plataforma` }
  return { value: JSON.stringify(list), keys, active: list.filter(c => c.enabled).map(c => c.key) }
}

export async function PATCH(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = await req.json()
  const { id, slug, ...rest } = body
  const data = Object.fromEntries(Object.entries(rest).filter(([k]) => (PLATFORM_EDITABLE as readonly string[]).includes(k)))
  // The secondary box is a size, or none: an empty or non-positive value clears it.
  for (const k of ['altThumbnailWidth', 'altThumbnailHeight'] as const) {
    if (k in data) {
      const n = Number(data[k])
      data[k] = n > 0 ? Math.round(n) : null
    }
  }
  if ('torrentSources' in data) {
    const checked = await checkTorrentSources(id, data.torrentSources)
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 })
    data.torrentSources = checked.value
    const prev = await db.platform.findUnique({ where: { id }, select: { torrentSources: true } })
    const before = parseSourceConfigs(prev?.torrentSources)
    const removed = before.map(s => s.key).filter(k => !checked.keys.includes(k))
    const activeBefore = before.filter(s => s.enabled).map(s => s.key).join('|')
    if (removed.length || activeBefore !== checked.active.join('|')) {
      await refreshTorrentGames(id, removed, checked.active)
    }
  }

  // Renaming the slug is NOT a plain field update: cover object keys in MinIO and
  // the launchbox_platform_map are keyed by slug, so it needs migration. Route it
  // through renamePlatformSlug instead of a blind update.
  if (slug !== undefined) {
    try {
      const result = await renamePlatformSlug(id, String(slug))
      // Apply any other fields changed in the same request.
      if (Object.keys(data).length) await db.platform.update({ where: { id }, data })
      const platform = await db.platform.findUnique({ where: { id } })
      return NextResponse.json({ ...platform, _rename: result })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Rename failed' }, { status: 409 })
    }
  }

  const platform = await db.platform.update({ where: { id }, data })
  return NextResponse.json(platform)
}

export async function DELETE(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const { id } = await req.json()
  try {
    const result = await deletePlatformDeep(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 500 })
  }
}
