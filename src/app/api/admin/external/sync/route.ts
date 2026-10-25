import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { syncTorrentSources } from '@/lib/external/torrents'
import { triggerAutoMetadata } from '@/lib/metadata/auto'

export const dynamic = 'force-dynamic'

// Actualiza ya las fuentes de torrents de todas las plataformas. Los juegos nuevos reciben sus
// metadatos por el mismo lote que tras un escaneo, en segundo plano.
export async function POST() {
  const denied = await adminGuard()
  if (denied) return denied
  try {
    const result = await syncTorrentSources()
    for (const [slug, g] of Object.entries(result.games)) {
      if (g.created > 0) triggerAutoMetadata(() => {}, slug).catch(err => console.error('[external] metadata:', err))
    }
    return NextResponse.json({ ok: true, ...result, metadataStarted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[external] sync:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
