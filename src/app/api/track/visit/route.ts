import { NextResponse } from 'next/server'
import { trackRequest } from '@/lib/tracker'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const path: string = body.path ?? '/'
    const durationMs: number | undefined = typeof body.durationMs === 'number' ? body.durationMs : undefined

    // Fire-and-forget, don't block the beacon response
    trackRequest({ req, path, status: 200, durationMs }).catch(() => {})
  } catch {
    // Never fail a beacon
  }
  return new NextResponse(null, { status: 204 })
}
