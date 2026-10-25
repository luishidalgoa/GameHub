import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { syncSwitchGames } from '@/lib/external/switch-games'

export const dynamic = 'force-dynamic'

// Actualiza ya la lista de torrents de Switch desde su fuente. Si la fuente falla, las filas anteriores se conservan.
export async function POST() {
  const denied = await adminGuard()
  if (denied) return denied
  try {
    return NextResponse.json({ ok: true, ...(await syncSwitchGames()) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[external] switch-games:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
