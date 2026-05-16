import { NextResponse } from 'next/server'
import { runScan } from '@/lib/scanner'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const platformSlug: string | undefined = body.platformSlug || undefined
  // Fire and forget — SSE stream provides progress
  runScan('manual', platformSlug).catch(console.error)
  return NextResponse.json({ ok: true, message: 'Scan started' })
}
