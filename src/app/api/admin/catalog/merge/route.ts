import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { rawDb } from '@/lib/db'
import { mergeCompanies } from '@/lib/catalog-merge'

export const dynamic = 'force-dynamic'

// POST { from, into } — the duplicate company's games and aliases move to the kept one,
// and the duplicate goes away. Repeatable only in the sense that a second call fails: the
// duplicate no longer exists.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { from?: unknown; into?: unknown }
  const from = Number(body.from)
  const into = Number(body.into)
  if (!Number.isInteger(from) || !Number.isInteger(into) || from === into) {
    return NextResponse.json({ error: 'from and into must be two different company ids' }, { status: 400 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await mergeCompanies(rawDb, from, into)) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'merge failed' }, { status: 404 })
  }
}
