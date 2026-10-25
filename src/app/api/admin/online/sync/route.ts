import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { syncOnlineSupport } from '@/lib/online/sync'

export const dynamic = 'force-dynamic'

// Actualiza ya la compatibilidad de juego en línea (la misma que hace la sincronización diaria).
export async function POST() {
  const denied = await adminGuard()
  if (denied) return denied
  return NextResponse.json(await syncOnlineSupport())
}
