import { db } from '@/lib/db'

/** Euler angles in radians, as `ConsoleModel.baseRotation`. */
export type Orientation = [number, number, number]
export type OrientationMap = Record<string, Orientation>

const KEY = 'console_orientation'

const isOrientation = (v: unknown): v is Orientation =>
  Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n))

/** Orientations the owner set in the editor, by platform slug. They win over the defaults in consoles.ts. */
export async function getOrientations(): Promise<OrientationMap> {
  try {
    const row = await db.setting.findUnique({ where: { key: KEY } })
    const parsed = row ? JSON.parse(row.value) : {}
    const out: OrientationMap = {}
    for (const [slug, v] of Object.entries(parsed)) if (isOrientation(v)) out[slug] = v
    return out
  } catch {
    return {}
  }
}

export async function saveOrientation(slug: string, rotation: Orientation | null): Promise<OrientationMap> {
  const current = await getOrientations()
  if (rotation) current[slug] = rotation
  else delete current[slug]
  const value = JSON.stringify(current)
  await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
  return current
}

export { isOrientation }
