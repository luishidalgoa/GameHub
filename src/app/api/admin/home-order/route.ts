import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { normalizeHomeOrder, saveHomeOrder } from '@/lib/home-order'

export const dynamic = 'force-dynamic'

export async function PUT(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const order = normalizeHomeOrder(body.order)
  await saveHomeOrder(order)
  return NextResponse.json({ ok: true, order })
}
