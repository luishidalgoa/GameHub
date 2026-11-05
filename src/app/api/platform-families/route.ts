import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'
import { PLATFORM_FAMILIES_KEY, loadPlatformFamilies } from '@/lib/platform-family-store'
import type { PlatformFamily } from '@/lib/platform-family'

export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/

export async function GET() {
  return NextResponse.json(await loadPlatformFamilies())
}

// PUT { families: PlatformFamily[] } → sustituye todas las familias. Cada plataforma va en una sola.
export async function PUT(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const checked = await checkFamilies(body.families)
  if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 })

  await db.setting.upsert({
    where: { key: PLATFORM_FAMILIES_KEY },
    update: { value: JSON.stringify(checked.value) },
    create: { key: PLATFORM_FAMILIES_KEY, value: JSON.stringify(checked.value) },
  })
  return NextResponse.json(checked.value)
}

async function checkFamilies(raw: unknown): Promise<{ value: PlatformFamily[] } | { error: string }> {
  if (!Array.isArray(raw)) return { error: 'families tiene que ser una lista' }
  const platforms = new Set((await db.platform.findMany({ select: { slug: true } })).map(p => p.slug))
  const familySlugs = new Set<string>()
  const members = new Set<string>()
  const out: PlatformFamily[] = []
  for (const f of raw as Partial<PlatformFamily>[]) {
    const slug = typeof f?.slug === 'string' ? f.slug.trim() : ''
    const name = typeof f?.name === 'string' ? f.name.trim() : ''
    if (!SLUG.test(slug)) return { error: `la familia «${slug || '?'}» tiene una clave no válida` }
    if (platforms.has(slug)) return { error: `«${slug}» ya es una plataforma` }
    if (familySlugs.has(slug)) return { error: `la familia «${slug}» está repetida` }
    if (!name || name.length > 40) return { error: `la familia «${slug}» necesita un nombre (hasta 40 letras)` }
    if (!Array.isArray(f.members) || f.members.length === 0) return { error: `la familia «${name}» no tiene plataformas` }
    const list: PlatformFamily['members'] = []
    for (const m of f.members as Partial<PlatformFamily['members'][number]>[]) {
      const mslug = typeof m?.slug === 'string' ? m.slug : ''
      const label = typeof m?.label === 'string' ? m.label.trim() : ''
      if (!platforms.has(mslug)) return { error: `«${mslug || '?'}» no es una plataforma` }
      if (members.has(mslug)) return { error: `«${mslug}» ya está en otra familia` }
      if (!label || label.length > 8) return { error: `la etiqueta de «${mslug}» tiene que tener de 1 a 8 letras` }
      members.add(mslug)
      list.push({ slug: mslug, label })
    }
    familySlugs.add(slug)
    out.push({ slug, name, members: list })
  }
  return { value: out }
}
