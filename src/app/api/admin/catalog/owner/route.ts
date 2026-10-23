import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { rawDb } from '@/lib/db'
import { setOwner } from '@/lib/catalog-merge'

export const dynamic = 'force-dynamic'

// POST { companies, owner } — the companies belong to `owner`; owner null takes them out of their group.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { companies?: unknown; owner?: unknown }
  const companies = Array.isArray(body.companies) ? body.companies.map(Number) : []
  const owner = body.owner === null ? null : Number(body.owner)
  if (companies.length === 0 || !companies.every(Number.isInteger) || (owner !== null && !Number.isInteger(owner))) {
    return NextResponse.json({ error: 'companies must be ids and owner an id or null' }, { status: 400 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await setOwner(rawDb, companies, owner)) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'owner failed' }, { status: 400 })
  }
}
