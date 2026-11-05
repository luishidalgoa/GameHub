import type { Platform } from '@/types/platform'

/**
 * Plataformas que el menú y la portada muestran como una sola entrada, con un filtro por consola.
 * La define el administrador en Ajustes; cada consola sigue siendo una plataforma propia en los datos.
 */
export interface PlatformFamily {
  slug: string
  name: string
  members: { slug: string; label: string }[]
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/

function isFamily(f: unknown): f is PlatformFamily {
  if (typeof f !== 'object' || f === null) return false
  const x = f as Partial<PlatformFamily>
  return typeof x.slug === 'string' && SLUG.test(x.slug)
    && typeof x.name === 'string' && x.name.trim() !== ''
    && Array.isArray(x.members) && x.members.length > 0
    && x.members.every(m => typeof m?.slug === 'string' && typeof m?.label === 'string')
}

export function parsePlatformFamilies(raw: string | null | undefined): PlatformFamily[] {
  if (!raw) return []
  try {
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? list.filter(isFamily) : []
  } catch {
    return []
  }
}

export function familyOf(families: PlatformFamily[], platformSlug: string): PlatformFamily | undefined {
  return families.find(f => f.members.some(m => m.slug === platformSlug))
}

export function familyBySlug(families: PlatformFamily[], slug: string): PlatformFamily | undefined {
  return families.find(f => f.slug === slug)
}

/** Las plataformas con sus familias plegadas: una tarjeta por familia, con la suma de juegos. */
export function collapseFamilies(
  rows: { slug: string; name: string; games: number }[],
  families: PlatformFamily[],
): { slug: string; name: string; games: number; members: string[] }[] {
  const out: { slug: string; name: string; games: number; members: string[] }[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const family = familyOf(families, r.slug)
    if (!family) {
      out.push({ slug: r.slug, name: r.name, games: r.games, members: [r.slug] })
      continue
    }
    if (seen.has(family.slug)) continue
    seen.add(family.slug)
    const inFamily = rows.filter(m => family.members.some(x => x.slug === m.slug))
    if (inFamily.length === 0) continue
    out.push({
      slug: family.slug,
      name: family.name,
      games: inFamily.reduce((n, m) => n + m.games, 0),
      members: inFamily.map(m => m.slug),
    })
  }
  return out
}

export interface MenuEntry {
  key: string
  href: string
  name: string
  iconSlug: string
  iconPath: string | null
  badge: number | undefined
}

/** Las plataformas como van en el menú: una familia es una sola entrada, en el sitio de su primera consola. */
export function menuEntries(platforms: Platform[], families: PlatformFamily[]): MenuEntry[] {
  const entries: MenuEntry[] = []
  const seen = new Set<string>()
  for (const p of platforms) {
    const family = familyOf(families, p.slug)
    if (!family) {
      entries.push({
        key: p.slug,
        href: `/platform/${p.slug}`,
        name: p.name,
        iconSlug: p.slug,
        iconPath: p.posterPath ?? p.iconPath,
        badge: p._count?.games,
      })
      continue
    }
    if (seen.has(family.slug)) continue
    seen.add(family.slug)
    const members = platforms.filter(m => family.members.some(x => x.slug === m.slug))
    if (members.length === 0) continue
    entries.push({
      key: family.slug,
      href: `/platform/${family.slug}`,
      name: family.name,
      iconSlug: members[0].slug,
      iconPath: members[0].posterPath ?? members[0].iconPath,
      badge: members.reduce((n, m) => n + (m._count?.games ?? 0), 0),
    })
  }
  return entries
}
