import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { rawDb } from '@/lib/db'
import { mergeCompanies } from '@/lib/catalog-merge'

export const dynamic = 'force-dynamic'

// POST { from, into } — `from` is one company id or a list. Their games, aliases and
// sub-companies move to `into`, and they go away.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { from?: unknown; into?: unknown }
  const list = Array.isArray(body.from) ? body.from : [body.from]
  const from = list.map(Number)
  const into = Number(body.into)
  if (from.length === 0 || !from.every(Number.isInteger) || !Number.isInteger(into) || from.includes(into)) {
    return NextResponse.json({ error: 'from and into must be different company ids' }, { status: 400 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await mergeCompanies(rawDb, from, into)) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'merge failed' }, { status: 400 })
  }
}
