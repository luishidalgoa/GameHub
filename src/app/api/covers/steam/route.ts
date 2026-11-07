import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { quotaGuard } from '@/lib/quota'
import { steamBackgrounds, searchSteamList } from '@/lib/metadata/steam'

export const dynamic = 'force-dynamic'

// GET ?q=zelda        → aplicaciones de Steam que coinciden con el texto: { games: [{ id, name }] }
// GET ?appId=123      → fondos de esa aplicación: { images: [{ url, thumb }] }
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const limited = quotaGuard(req.headers, 'steam')
  if (limited) return limited

  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const appId = Number(searchParams.get('appId'))

    if (appId > 0) {
      return NextResponse.json({ images: await steamBackgrounds(appId) })
    }
    if (q) {
      return NextResponse.json({ games: await searchSteamList(q) })
    }
    return NextResponse.json({ error: 'Missing q or appId' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
