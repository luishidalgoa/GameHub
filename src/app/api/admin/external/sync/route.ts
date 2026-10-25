import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { syncSwitchGames } from '@/lib/external/switch-games'
import { triggerAutoMetadata } from '@/lib/metadata/auto'

export const dynamic = 'force-dynamic'

// Actualiza ya la lista de torrents de Switch desde su fuente. Los juegos nuevos reciben sus
// metadatos por el mismo lote que tras un escaneo, en segundo plano. Si la fuente falla, no se toca nada.
export async function POST() {
  const denied = await adminGuard()
  if (denied) return denied
  try {
    const result = await syncSwitchGames()
    triggerAutoMetadata(() => {}, 'switch').catch(err => console.error('[external] metadata:', err))
    return NextResponse.json({ ok: true, ...result, metadataStarted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[external] switch-games:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
