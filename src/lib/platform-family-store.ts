import { db } from '@/lib/db'
import { parsePlatformFamilies, type PlatformFamily } from '@/lib/platform-family'

export const PLATFORM_FAMILIES_KEY = 'platform_families'

export async function loadPlatformFamilies(): Promise<PlatformFamily[]> {
  const row = await db.setting.findUnique({ where: { key: PLATFORM_FAMILIES_KEY }, select: { value: true } })
  return parsePlatformFamilies(row?.value)
}
