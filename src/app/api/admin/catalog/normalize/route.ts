import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { normalizeCatalog } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

// POST — link every game to its canonical company and genre rows. Safe to repeat.
export async function POST() {
  const denied = await adminGuard()
  if (denied) return denied
  return NextResponse.json({ ok: true, ...(await normalizeCatalog()) })
}
