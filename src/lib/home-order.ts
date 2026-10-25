import { db } from '@/lib/db'

export const HOME_SECTIONS = [
  'recommended', 'featured', 'recent', 'releases', 'consoles', 'publishers', 'topDownloads', 'friends',
] as const
export type HomeSection = (typeof HOME_SECTIONS)[number]

export const HOME_SECTION_LABELS: Record<HomeSection, string> = {
  recommended: 'Para ti (recomendados)',
  featured: 'Destacados',
  recent: 'Añadidos recientemente',
  releases: 'Lanzamientos recientes',
  consoles: 'Consolas',
  publishers: 'Editoras',
  topDownloads: 'Más descargados',
  friends: 'Juega con amigos',
}

const SETTING_KEY = 'home_sections_order'

/** Orden válido: las secciones guardadas en su orden y, al final, las que falten en el orden por defecto. */
export function normalizeHomeOrder(raw: unknown): HomeSection[] {
  const given = Array.isArray(raw)
    ? [...new Set(raw.filter((k): k is HomeSection => (HOME_SECTIONS as readonly string[]).includes(k as string)))]
    : []
  return [...given, ...HOME_SECTIONS.filter(k => !given.includes(k))]
}

export async function getHomeOrder(): Promise<HomeSection[]> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } })
  let raw: unknown = null
  try {
    raw = row?.value ? JSON.parse(row.value) : null
  } catch {
    raw = null
  }
  return normalizeHomeOrder(raw)
}

export async function saveHomeOrder(order: HomeSection[]): Promise<void> {
  const value = JSON.stringify(order)
  await db.setting.upsert({ where: { key: SETTING_KEY }, update: { value }, create: { key: SETTING_KEY, value } })
}
