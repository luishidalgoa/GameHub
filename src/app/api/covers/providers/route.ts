import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { imageSourcesFor } from '@/lib/providers/images'
import { IMAGE_SLOTS, type ImageSlot } from '@/lib/providers/catalog'

export const dynamic = 'force-dynamic'

// GET ?slot=cover&platform=switch → las fuentes que cubren ese hueco, y si responden para la plataforma.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const sp = new URL(req.url).searchParams
  const slot = sp.get('slot')
  const platform = sp.get('platform')?.trim()
  if (!slot || !(IMAGE_SLOTS as readonly string[]).includes(slot) || !platform) {
    return NextResponse.json({ error: 'Missing or unknown slot, or platform' }, { status: 400 })
  }
  return NextResponse.json({ sources: await imageSourcesFor(slot as ImageSlot, platform) })
}
