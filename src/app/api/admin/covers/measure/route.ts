import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { measureCovers, unmeasuredCovers } from '@/lib/covers-measure'

export const dynamic = 'force-dynamic'

// The most one request spends: the browser asks again until nothing is left to measure.
const MAX_BUDGET_MS = 45_000

// GET ?platform= — how many covers still wait to be measured.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const platform = new URL(req.url).searchParams.get('platform') || undefined
  return NextResponse.json({ remaining: await unmeasuredCovers(platform) }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST { platform?, budgetMs? } — measures covers for one stretch of time.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = (await req.json().catch(() => ({}))) as { platform?: unknown; budgetMs?: unknown }
  const budget = typeof body.budgetMs === 'number' ? Math.min(MAX_BUDGET_MS, Math.max(1000, body.budgetMs)) : MAX_BUDGET_MS
  const platformSlug = typeof body.platform === 'string' && body.platform ? body.platform : undefined
  return NextResponse.json(await measureCovers({ platformSlug, budgetMs: budget }), { headers: { 'Cache-Control': 'no-store' } })
}
