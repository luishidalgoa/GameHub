import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { requeueUnfindable } from '@/lib/metadata/retry'

export const dynamic = 'force-dynamic'

// POST { ids?: number[] } — requeue unfindable games (all of them, or the given ids).
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { ids?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is number => Number.isInteger(x)) : undefined
  return NextResponse.json({ ok: true, requeued: await requeueUnfindable(ids) })
}
